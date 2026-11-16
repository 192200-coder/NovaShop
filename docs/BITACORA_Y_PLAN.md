# Bitácora de la integración de pagos y plan para la próxima sesión

Última actualización: 15/11/2026.

## Estado actual

| Parte | Estado |
| --- | --- |
| Login y sesiones (Ana / Miguel) | ✅ Funciona |
| Mercado Pago (Checkout Pro) | ✅ Probado de punta a punta en el navegador: pago `APRO`, regreso automático con ngrok y webhook firmado (200) |
| Stripe Checkout (sandbox) | ✅ El checkout se crea y redirige. ⚠️ Falta un pago completo en el navegador |
| PayPal (sandbox) | ✅ La orden se crea y redirige. ⚠️ Falta un pago y captura completos en el navegador |
| Simulador | ✅ Funciona |
| Pruebas automáticas | ✅ 29/29 (`npm test` en `backend`) |
| ngrok | Dominio estático `tug-custody-earful.ngrok-free.dev` (túnel al frontend, puerto 5173) |

## Errores encontrados y cómo se resolvieron

| # | Síntoma | Causa | Solución |
| --- | --- | --- | --- |
| 1 | Mercado Pago muestra "*Una de las partes con la que intentas hacer el pago es de prueba*" | El navegador tenía abierta una sesión **real** de Mercado Pago y el vendedor es una cuenta **de prueba** | Pagar en una ventana de **incógnito** (o con el comprador de prueba) |
| 2 | Al volver de Mercado Pago, el pedido seguía "pendiente" y el carrito no se vaciaba | `React.StrictMode` ejecuta dos veces el inicializador de estado. La primera lectura limpiaba la URL y la segunda no encontraba los parámetros de retorno | Commit `00cf744`: la URL se lee una sola vez y sin efectos secundarios; además se guarda el "pedido en curso" en `localStorage` y se verifica al volver |
| 3 | Webhook con **502** en el panel de Mercado Pago (19:37) | ngrok estaba activo, pero el backend o el frontend se estaba reiniciando | No es un fallo del código. El pedido se recupera con **Mis pedidos → Verificar pago** |
| 4 | Webhook con **404** en el panel | El túnel de ngrok estaba **apagado** (`ERR_NGROK_3200`) | Mantener ngrok encendido durante las pruebas |
| 5 | El historial "Notificaciones enviadas" aparecía vacío | El panel tarda en mostrar los envíos | Esperar o recargar. Para verlo en vivo, usar el inspector de ngrok: http://127.0.0.1:4040 |
| 6 | Falló "Simular notificación" del panel | La petición no llegó a ngrok; posiblemente la frenó la página de aviso de ngrok gratuito | No afecta a los webhooks reales, que sí pasan (el aviso solo se muestra a navegadores) |
| 7 | Login respondió 500 una vez | El proxy de Vite no alcanzó al backend mientras este se reiniciaba | Reintentar; no es un fallo del código |
| 8 | Login 403 o regreso a `localhost` al usar ngrok | El backend solo aceptaba `CLIENT_ORIGIN` y Vite bloqueaba los dominios desconocidos | Commit `d18e6b6`: se acepta el origen de `MP_BACK_URL_BASE`, y Vite permite los dominios de ngrok (`allowedHosts`) |
| 9 | `CLIENT_ORIGIN` estaba en `http://` | El frontend corre en HTTPS | Cambiado a `https://localhost:5173` |

### Lecciones
- La página de "éxito" de la pasarela **no prueba un pago**: la tienda siempre consulta el estado real en la API (retorno, webhook o "Verificar pago").
- Hay **tres vías** que confirman un pago. Si una falla, quedan las otras dos.
- El aviso de ngrok gratuito solo afecta a navegadores. En la demo, pulsar **Visit Site** una vez al abrir la ventana de incógnito.
- Las pruebas por API no detectan errores que solo aparecen en el navegador (como el n.º 2). Hay que probar también a mano.

## Plan para la próxima sesión

### Prioridad alta
1. **Seguridad de credenciales**
   - Pedir al compañero que cambie la contraseña de su MongoDB Atlas y renueve sus 3 Access Tokens de Mercado Pago (venían en los `.env` de sus zips).
   - `backend/certificados/localhost-key.pem` está versionado en Git. Es solo un certificado de desarrollo para `localhost`, pero si el repositorio es público conviene regenerarlo y sacarlo de Git (`.gitignore`).
2. **Corregir la documentación de la base de datos.** Los datos están en la base `test`, porque `MONGODB_URI` no incluye un nombre de base. El README dice `use Ecomerce`. Decidir entre corregir el README a `use test` o agregar `/Ecomerce` a la URI y volver a ejecutar `seed` y `seed:users`.
3. **Probar Stripe y PayPal de punta a punta en el navegador** (tarjeta `4242…`, y una cuenta personal sandbox de PayPal) y anotar el resultado.
4. **Limpiar los pedidos de prueba** (pendientes de Ana y Miguel) antes de la demo. Verificar primero el pedido de Miguel con el pago aprobado `188264838855`.

### Prioridad media
5. **Conciliación automática:** verificar automáticamente los pedidos `pendiente` o `revision` con checkout iniciado, por ejemplo al abrir "Mis pedidos" o con una tarea periódica en el backend. Así un webhook perdido (502/404) no deja pedidos atascados.
6. **Pedidos atascados en `procesando`:** si el servidor se cae mientras crea el checkout, el pedido queda en `procesando` sin referencia. Agregar una expiración que lo devuelva a `pendiente`.
7. **Descontar el stock** cuando un pedido pasa a `pagado` (hoy solo se valida al crear el pedido).
8. **Proteger el CRUD de productos** con un rol de administrador. Hoy crear, editar y eliminar productos es público.

### Prioridad baja / ideas
9. Pruebas del frontend (por ejemplo, la lectura de los parámetros de retorno) para que no se repita el error n.º 2.
10. Guion de demostración como `DEMO.md`.
11. Despliegue real (Render/Railway + Atlas) para no depender de ngrok.
