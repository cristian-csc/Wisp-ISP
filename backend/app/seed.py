from sqlalchemy.orm import Session
from passlib.context import CryptContext
from . import models

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_initial_data(db: Session):
    # Seed planes — velocidades son placeholder, falta confirmar las reales
    if db.query(models.Plan).count() == 0:
        planes = [
            models.Plan(codigo="PLAN39", nombre="Internet 39", bajada_mbps=15, subida_mbps=5, precio=39.0),
            models.Plan(codigo="PLAN49", nombre="Internet 49", bajada_mbps=20, subida_mbps=8, precio=49.0),
            models.Plan(codigo="PLAN69", nombre="Internet + TV 69", bajada_mbps=30, subida_mbps=15, precio=69.0,
                        incluye_tv=True, tv_incluidas=1),
            models.Plan(codigo="PLAN99", nombre="Internet + TV 99", bajada_mbps=50, subida_mbps=20, precio=99.0,
                        incluye_tv=True, tv_incluidas=1),
        ]
        db.add_all(planes)
        db.commit()

    # Seed zonas
    if db.query(models.Zona).count() == 0:
        zonas = [
            models.Zona(nombre="Cabanillas", ip_wireguard="10.10.0.2", router_mikrotik="RB-Cabanillas", ip_router="192.168.1.1"),
            models.Zona(nombre="Palca", ip_wireguard="10.10.0.3", router_mikrotik="RB-Palca", ip_router="192.168.2.1"),
            models.Zona(nombre="Paratia", ip_wireguard="10.10.0.4", router_mikrotik="RB-Paratia", ip_router="192.168.3.1"),
        ]
        db.add_all(zonas)
        db.commit()

    # Seed admin user
    if db.query(models.Usuario).count() == 0:
        admin = models.Usuario(
            nombre="Administrador",
            email="admin@dominiowisp.com",
            hashed_password=pwd_context.hash("admin2024"),
            rol=models.RolUsuario.admin,
        )
        db.add(admin)
        db.commit()
