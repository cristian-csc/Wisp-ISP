import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional

from ..database import get_db
from .. import models, schemas
from ..config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.Usuario).filter(models.Usuario.email == email).first()
    if user is None or not user.activo:
        raise credentials_exception
    return user


def require_roles(*roles: models.RolUsuario):
    """Dependencia que exige que el usuario autenticado tenga uno de los roles dados.
    Uso: current_user: models.Usuario = Depends(require_roles(RolUsuario.admin))

    `super_admin` siempre pasa cualquier chequeo que incluya `admin` — es un
    superset (todo lo del admin de negocio + infraestructura), no un rol
    aparte que haya que listar en cada endpoint uno por uno."""
    def dependency(current_user: models.Usuario = Depends(get_current_user)) -> models.Usuario:
        allowed = set(roles)
        if models.RolUsuario.admin in allowed:
            allowed.add(models.RolUsuario.super_admin)
        if current_user.rol not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para esta acción",
            )
        return current_user
    return dependency


def zonas_asignadas(db: Session, usuario: models.Usuario) -> list[int]:
    """IDs de zona asignadas a un técnico. Vacío si el usuario no es técnico
    (no se usa para filtrar en ese caso — admin/subadmin ven todas las zonas)."""
    return [
        tz.zona_id for tz in
        db.query(models.TecnicoZona).filter(models.TecnicoZona.tecnico_id == usuario.id).all()
    ]


def get_current_cliente(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """Dependencia para endpoints exclusivos de clientes en la app móvil."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        role: str = payload.get("role")
        cliente_id: int = payload.get("cliente_id")
        if role != "cliente" or cliente_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise credentials_exception
    return cliente


@router.post("/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.Usuario).filter(models.Usuario.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        logger.warning("Login fallido para: %s", form_data.username)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales incorrectas")
    if not user.activo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cuenta desactivada")
    token = create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer"}


@router.post("/cliente/login", response_model=schemas.ClienteTokenResponse)
def cliente_login(data: schemas.ClienteLoginRequest, db: Session = Depends(get_db)):
    """Login para clientes en la app móvil. Usuario y contraseña son su DNI
    por defecto; si el cliente cambió su contraseña desde la app, se valida
    contra ese valor en vez del DNI."""
    usuario = data.usuario.strip()
    cliente = db.query(models.Cliente).filter(
        models.Cliente.dni == usuario
    ).first()

    if not cliente:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrecta",
        )
    if cliente.pin_app:
        # Cliente configuró una contraseña personalizada
        if not pwd_context.verify(data.pin.strip(), cliente.pin_app):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrecta")
    else:
        # Por defecto, la contraseña es el mismo DNI
        if not cliente.dni or data.pin.strip() != cliente.dni:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrecta")

    if cliente.estado == models.EstadoCliente.anulado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cuenta no disponible",
        )

    token = create_access_token({
        "sub": f"cliente:{cliente.id}",
        "role": "cliente",
        "cliente_id": cliente.id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "cliente",
        "cliente_id": cliente.id,
        "nombre": cliente.nombre,
    }


@router.get("/me", response_model=schemas.UsuarioOut)
def get_me(current_user: models.Usuario = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=schemas.UsuarioOut)
def update_me(
    data: schemas.UsuarioSelfUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    """Autoservicio: cualquier usuario autenticado puede actualizar su propio
    teléfono/dirección — son datos de contacto, la persona misma es quien
    sabe que cambiaron. Nombre, DNI, fecha de ingreso, rol y activo quedan
    fuera a propósito — eso lo controla solo el administrador."""
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(current_user, key, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/password")
def change_password(
    data: schemas.ChangePassword,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(get_current_user),
):
    if not verify_password(data.password_actual, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    if len(data.password_nueva) < 8:
        raise HTTPException(status_code=400, detail="La contraseña nueva debe tener al menos 8 caracteres")
    current_user.hashed_password = get_password_hash(data.password_nueva)
    db.commit()
    return {"ok": True}


@router.get("/usuarios", response_model=list[schemas.UsuarioOut])
def list_usuarios(
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    return db.query(models.Usuario).order_by(models.Usuario.nombre).all()


@router.post("/usuarios", response_model=schemas.UsuarioOut)
def create_usuario(
    data: schemas.UsuarioCreate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    if db.query(models.Usuario).filter(models.Usuario.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    user = models.Usuario(
        nombre=data.nombre,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        rol=data.rol,
        telefono=data.telefono,
        dni=data.dni,
        direccion=data.direccion,
        fecha_ingreso=data.fecha_ingreso,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/usuarios/{usuario_id}", response_model=schemas.UsuarioOut)
def update_usuario(
    usuario_id: int,
    data: schemas.UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Editar nombre/rol o activar/desactivar un usuario (técnico, vendedor, etc.).
    Desactivar corta el acceso al instante — get_current_user revisa `activo`
    contra la BD en cada request, no depende de que expire el token."""
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/usuarios/{usuario_id}")
def delete_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(require_roles(models.RolUsuario.admin)),
):
    """Solo se puede borrar un usuario que de verdad nunca hizo nada — si
    tiene clientes, pagos, averías, etc. a su nombre, ese historial vale
    demasiado para perderlo por error. Para esos casos basta con
    desactivarlo (el switch de 'Activo'), nunca borrarlo."""
    user = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")

    referencias = []

    def contar(query, etiqueta):
        n = query.count()
        if n:
            referencias.append(f"{n} {etiqueta}")

    contar(db.query(models.Cliente).filter(models.Cliente.vendedor_id == usuario_id), "cliente(s) registrados")
    contar(db.query(models.Cliente).filter(models.Cliente.tecnico_instalador_id == usuario_id), "instalación(es) realizadas")
    contar(db.query(models.Cliente).filter(models.Cliente.aprobado_por_id == usuario_id), "aprobación(es) de clientes")
    contar(db.query(models.Pago).filter(models.Pago.registrado_por == usuario_id), "pago(s) registrados")
    contar(db.query(models.Averia).filter(models.Averia.tecnico_asignado_id == usuario_id), "avería(s) atendidas")
    contar(db.query(models.OrdenRetiro).filter(models.OrdenRetiro.tecnico_asignado_id == usuario_id), "retiro(s) de equipo")
    contar(db.query(models.Historial).filter(models.Historial.usuario_id == usuario_id), "registro(s) de historial")
    contar(db.query(models.Gasto).filter(models.Gasto.registrado_por == usuario_id), "gasto(s) registrados")
    contar(db.query(models.Onu).filter(models.Onu.tecnico_id == usuario_id), "ONU(s) en su inventario")
    contar(db.query(models.MensajeMasivo).filter(models.MensajeMasivo.creado_por_id == usuario_id), "mensaje(s) masivo(s) enviados")
    contar(db.query(models.Evidencia).filter(models.Evidencia.subido_por_id == usuario_id), "evidencia(s) subidas")

    if referencias:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar — tiene historial real asociado: " + ", ".join(referencias) +
            ". Si ya no trabaja aquí, desactívalo en vez de eliminarlo.",
        )

    db.query(models.TecnicoZona).filter(models.TecnicoZona.tecnico_id == usuario_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}
