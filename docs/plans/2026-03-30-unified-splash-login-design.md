# Unified Splash Login Design

## Goal

Restore the product experience to a single real splash screen using the particle-based `ZM` animation, then transition into a login page that feels like the immediate next frame of the same product.

## Decisions

- `index.html` becomes the only real splash entry page.
- `开屏动画.html` remains as a legacy compatibility shim that forwards old links into `index.html`.
- The login page keeps a minimal form but adopts the same dark, restrained, glassy visual language already used by the splash and workspace pages.
- The authentication flow remains simple: users move from splash to login to the protected pages.

## Visual Direction

- Keep the splash fully immersive and unchanged in spirit: black ground, particle `ZM`, restrained supporting copy.
- Make the login page feel like the splash settled into a static state instead of cutting to a generic template.
- Use the existing palette, typography, border opacity, and panel treatment from the current app rather than introducing a separate style system.
