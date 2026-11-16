# NovaShop — React + Node.js + MongoDB Atlas

Proyecto educativo con catálogo, búsqueda, filtros, CRUD de productos, carrito, **login**, **Mis pedidos** y **pagos de prueba** con Mercado Pago, Stripe y PayPal (sandbox), más un simulador local.

## Requisitos
Node.js 20.19+ (o 22.12+), npm, cuenta MongoDB Atlas y los certificados locales en `backend/certificados`.

## Instalación rápida

1. En MongoDB Atlas, crea un clúster y un usuario, y autoriza tu IP en Network Access.
2. En `backend`: `npm install`, copia `.env.example` a `.env` y completa `MONGODB_URI` (no publiques `.env`).
3. En `backend`: `npm run seed` (catálogo), `npm run seed:users` (usuarios de prueba) y `npm run dev`. API: `https://localhost:3443/api/salud`.
4. En **otra terminal**, en `frontend`: `npm install` y `npm run dev`.
5. Abre `https://localhost:5173`.

### Usuarios de prueba

| Correo | Contraseña |
| --- | --- |
| ana@novashop.test | AnaDemo2026! |
| miguel@novashop.test | MiguelDemo2026! |

## Pagos de prueba

Pagar exige iniciar sesión. El navegador solo envía IDs y cantidades: **el servidor calcula el total** con los precios de MongoDB, guarda el pedido y crea el checkout en la pasarela. Al volver, el backend **consulta el estado real del pago** a la pasarela (no confía en la URL de retorno).

| Pasarela | Variable(s) en `backend/.env` | Moneda | Cómo se confirma |
| --- | --- | --- | --- |
| Mercado Pago (Checkout Pro) | `MP_ACCESS_TOKEN` (de prueba) | PEN | Busca los pagos por `external_reference` |
| Stripe Checkout | `STRIPE_SECRET_KEY` (`sk_test_…`) | USD | Consulta la sesión de Checkout |
| PayPal (Orders v2, sandbox) | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | USD | Captura la orden aprobada |
| Simulador | `PAGOS_SIMULADOR=true` | PEN | Eliges aprobado / rechazado / timeout |

Stripe y PayPal sandbox cobran en dólares con `TIPO_CAMBIO_PEN_USD` (3.75 por defecto). Si una pasarela no tiene credenciales, aparece como "No configurado". Solo se aceptan claves de prueba.

### Configurar Mercado Pago

1. Entra a [Mercado Pago Developers → Tus integraciones](https://www.mercadopago.com.pe/developers/panel/app) y crea una aplicación de tipo **Checkout Pro** (pagos online).
2. En la aplicación, abre **Credenciales de prueba** y copia el **Access Token**. Pégalo **solo** en `backend/.env` como `MP_ACCESS_TOKEN=...` y reinicia el backend. Nunca lo pongas en el frontend, en capturas ni en Git.
3. En **Cuentas de prueba**, ubica (o crea, país Perú) un **comprador de prueba**. Para pagar, abre el checkout en una ventana de incógnito e inicia sesión con ese comprador, **no** con tu cuenta real.
4. Usa las [tarjetas de prueba](https://www.mercadopago.com.pe/developers/es/docs/checkout-pro/integration-test/test-cards). En el nombre del titular escribe `APRO` (aprobado), `OTHE` (rechazado) o `CONT` (pendiente).

Mercado Pago no redirige automáticamente a `localhost`: al terminar pulsa **Volver al sitio**, o entra a **Mis pedidos → Verificar pago**. Para tener el regreso automático y los webhooks, usa ngrok.

### Regreso automático y webhooks con ngrok (opcional)

Un solo túnel al **frontend** basta, porque Vite reenvía `/api` al backend.

1. Crea una cuenta en [ngrok](https://dashboard.ngrok.com), instala el agente y ejecuta `ngrok config add-authtoken TU_TOKEN`. En *Domains* reclama tu **dominio estático gratuito**, así la URL no cambia cada vez.
2. Con backend y frontend encendidos, en una tercera terminal: `ngrok http https://localhost:5173 --url=https://tu-dominio.ngrok-free.app`
3. En `backend/.env`:
   ```dotenv
   MP_BACK_URL_BASE=https://tu-dominio.ngrok-free.app
   MP_WEBHOOK_URL=https://tu-dominio.ngrok-free.app/api/pagos/webhook
   ```
4. En Mercado Pago, entra a **Tus integraciones → tu aplicación → Webhooks → Configurar notificaciones**. En *Modo de prueba* pega la misma `MP_WEBHOOK_URL`, marca el evento **Pagos** y guarda. Copia la **clave secreta** que aparece en `MP_WEBHOOK_SECRET`. Esta clave no la da ngrok y **no es** el Access Token.
5. Reinicia el backend y **abre la tienda desde `https://tu-dominio.ngrok-free.app`**. La primera vez, ngrok muestra un aviso: pulsa *Visit Site*. Inicia sesión ahí, porque la sesión de `localhost` no se comparte con otro dominio.

Con esto, Mercado Pago vuelve solo a la tienda al aprobar el pago, y Stripe y PayPal también regresan al dominio de ngrok. Con la herramienta *Simular notificación* del panel puedes comprobar que el webhook responde 200. Sin ngrok, todo sigue funcionando con **Verificar pago**.

### Stripe y PayPal

- Stripe: tarjeta `4242 4242 4242 4242`, cualquier fecha futura y CVC. Rechazo: `4000 0000 0000 0002`.
- PayPal: inicia sesión con una cuenta **Personal** de [sandbox](https://developer.paypal.com/dashboard/accounts).

### Estados del pedido

| Estado | Significado |
| --- | --- |
| `pendiente` | Pedido creado; el pago aún no se confirma. Se puede continuar o verificar. |
| `procesando` | El servidor está creando el checkout. |
| `pagado` | La pasarela confirmó el pago con el monto, la moneda y la referencia correctos. |
| `rechazado` | La pasarela rechazó el pago o la sesión expiró. |
| `revision` | Resultado incierto o pendiente (p. ej. `CONT`). Vuelve a verificar más tarde. |

## Endpoints de la API

Productos: `GET /api/productos` (filtros `buscar`, `categoria`, `min`, `max`), `/categorias`, `/resumen`, `/:id`, y `POST`/`PUT`/`DELETE` educativos.

| Método y ruta | Sesión | Descripción |
| --- | --- | --- |
| `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/logout` | — | Inicio, consulta y cierre de sesión (cookie `HttpOnly`) |
| `GET /api/pagos/config` | No | Pasarelas habilitadas (nunca devuelve claves) |
| `GET /api/pagos/pedidos` · `GET /api/pagos/pedidos/:id` | Sí | Mis pedidos |
| `POST /api/pagos/pedidos` | Sí | `{ items: [{ producto, cantidad }], proveedor }` |
| `POST /api/pagos/pedidos/:id/checkout` | Sí | Crea el checkout y devuelve `checkoutUrl` |
| `POST /api/pagos/pedidos/:id/verificar` | Sí | Consulta el estado real en la pasarela |
| `POST /api/pagos/pedidos/:id/pagar` | Sí | Simulador: `{ escenario: "aprobado" \| "rechazado" \| "timeout" }` |
| `POST /api/pagos/webhook` | Firma | Notificaciones de Mercado Pago |

## Pruebas

En `backend`: `npm test` (29 pruebas con pasarelas y base de datos simuladas; no hacen cobros ni llamadas externas). En `frontend`: `npm run build`.

## Consultas de ejemplo en mongosh

```js
use Ecomerce
db.productos.find({precio:{$gte:100}})
db.pedidos.find({}, {proveedor:1, estado:1, totalCentimos:1, cargoId:1}).sort({createdAt:-1})
db.productos.aggregate([{$group:{_id:'$categoria',cantidad:{$sum:1}}}])
```

**Límites de la demo:** solo modo de prueba; el stock se valida pero no se descuenta; no hay envío, impuestos, reembolsos ni roles de administrador (las rutas de escritura de productos siguen siendo públicas).

## Bitácora y pendientes

Errores encontrados durante las pruebas, sus soluciones y el plan para la próxima sesión: [docs/BITACORA_Y_PLAN.md](docs/BITACORA_Y_PLAN.md).
