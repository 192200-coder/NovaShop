# NovaShop — React + Node.js + MongoDB Atlas

Proyecto educativo con catálogo, búsqueda, filtros, carrito local y API REST conectada a MongoDB Atlas.

## Requisitos
Node.js 20.19+ (o 22.12+), npm, cuenta MongoDB Atlas, Visual Studio Code.

## Instalación rápida

1. En MongoDB Atlas, crea un clúster, un usuario de base de datos y autoriza tu IP actual en Network Access.
2. Abre una terminal en `backend`, ejecuta `npm install`, copia `.env.example` a `.env` y reemplaza `MONGODB_URI` con TU cadena de conexión (no publiques el archivo `.env`).
3. En `backend`, ejecuta `npm run seed` y después `npm run dev`. La API estará en `http://localhost:4000/api/salud`.
4. Abre **otra terminal** en `frontend`, ejecuta `npm install` y `npm run dev`.
5. Abre `http://localhost:5173` en el navegador.

## Consultas de ejemplo en mongosh

```js
use Ecomerce
db.productos.find({precio:{$gte:100}})
db.productos.find({categoria:{$in:['Audio','Computadoras']}})
db.productos.aggregate([{$group:{_id:'$categoria',cantidad:{$sum:1}}}])
```

## Endpoints de la API
`GET /api/salud` · `GET /api/productos` · `GET /api/productos?buscar=mouse` · `GET /api/productos?categoria=Audio&min=100` · `GET /api/productos/categorias` · `GET /api/productos/resumen` · `GET /api/productos/:id`.

**Importante:** el carrito es solamente una demostración en React; no procesa pedidos ni pagos. Las rutas públicas son solo de lectura para evitar cambios no autorizados en la base de datos. Para producción se necesita autenticación, autorización, control de inventario y pasarela de pago.
