import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'src/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:cursor-pointer',
  {
    variants: {
      variant: {
        // La accion principal va en el naranja de marca con tinta oscura.
        // Sobre naranja el blanco da 2,45:1 y no se lee; la tinta da 7,25:1.
        default: 'bg-brand text-brand-foreground hover:bg-brand/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Secundaria: borde neutro. El naranja se reserva para la principal,
        // para que en una barra de botones se vea cual es cual.
        outline:
          'border border-ld bg-card text-foreground hover:bg-muted',
        outlinesecondary:
          'border border-secondary text-secondary bg-transparent hover:bg-secondary hover:text-secondary-foreground',
        outlinesuccess:
          'border border-success bg-transparent hover:bg-success text-success hover:text-white',
        outlinewarning:
          'border border-warning bg-transparent hover:bg-warning text-warning hover:text-white',
        outlineinfo:
          'border border-info bg-transparent hover:bg-info text-info hover:text-white',
        outlineerror:
          'border border-error bg-transparent hover:bg-error text-error hover:text-white',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondaryemphasis',
        success: 'bg-success-solid text-on-solid hover:bg-success-solid/90',
        warning: 'bg-warning-solid text-on-solid hover:bg-warning-solid/90',
        info: 'bg-info-solid text-on-solid hover:bg-info-solid/90',
        error: 'bg-error-solid text-on-solid hover:bg-error-solid/90',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        ghostprimary: 'hover:bg-lightprimary hover:text-primary text-primary',
        ghostsecondary:
          'hover:bg-lightsecondary hover:text-secondary text-secondary',
        ghostsuccess: 'hover:bg-lightsuccess hover:text-success text-success',
        ghostwarning: 'hover:bg-lightwarning hover:text-warning text-warning',
        ghosterror: 'hover:bg-lighterror hover:text-error text-error',
        ghostinfo: 'hover:bg-lightinfo hover:text-info text-info',
        link: 'text-primary underline-offset-4 hover:underline',
        lightprimary:
          'bg-lightprimary text-primary-text hover:bg-primary hover:text-primary-foreground',
        lightsecondary:
          'bg-lightsecondary text-secondary hover:bg-secondary hover:text-secondary-foreground',
        lightsuccess:
          'bg-lightsuccess text-success-text hover:bg-success-solid hover:text-on-solid',
        lightwarning:
          'bg-lightwarning text-warning-text hover:bg-warning-solid hover:text-on-solid',
        lightinfo: 'bg-lightinfo text-info-text hover:bg-info-solid hover:text-on-solid',
        lighterror: 'bg-lighterror text-error-text hover:bg-error-solid hover:text-on-solid',
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
      shape: {
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shape, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
