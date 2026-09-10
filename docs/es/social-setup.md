---
title: Publicación en redes sociales
layout: default
nav_order: 6
lang: es
permalink: /social-setup.html
---

# Publicación en redes sociales

Richfolio puede **opcionalmente** publicar sus señales de compra en cuentas sociales públicas — **X/Twitter**, una **página de Facebook**, una cuenta de **Threads** y una **página de LinkedIn** — junto con los resúmenes de correo + Telegram. Solo corre en los modos **diario** e **intradía** (nunca semanal ni refresh).

Esto es **totalmente opcional**. Si no configuras ninguna credencial social, no se publica nada y el resto de Richfolio funciona exactamente como antes — cada plataforma registra una línea "credentials not set — skipping" y continúa.

---

## Qué se publica
{: .text-green-200}

Las publicaciones son deliberadamente **genéricas** para que no se filtre nada privado:

- Solo señales **STRONG BUY** y **BUY** (HOLD/WAIT se omiten).
- Cada señal muestra **ticker, acción, confianza, una razón breve** y opcionalmente una calificación de valor — nada más.
- Los tickers de la cartera objetivo y de la lista de observación se combinan **de forma uniforme como "señales"** — no hay etiqueta de "cartera vs lista de observación", por lo que tus tenencias nunca se revelan.
- **Nunca se publica:** asignaciones, brechas, montos de compra sugeridos, número de acciones, valor total de la cartera. `buildSignalLines()` en `src/socialContent.ts` es el único punto de control de la lista de permitidos, y `sanitizeReason()` elimina cualquier texto de brecha de asignación, dimensionamiento en dólares o descuento por solapamiento que la IA pudiera escribir en su razón. Ambos están cubiertos por pruebas unitarias.
- El ticker se renderiza como un **`#hashtag`** clicable en Facebook / Threads / LinkedIn (los cashtags solo funcionan en X, donde se mantiene como un `$cashtag`). En las plataformas que no son X se añade un conjunto configurable de hashtags genéricos para aumentar el alcance.
- Cada publicación termina con un descargo de responsabilidad: *"No es asesoría financiera. Generado automáticamente por Richfolio."*

---

## Activar / desactivar
{: .text-green-200}

Un bloque `social` en `config.json` es el interruptor principal (se muestran los valores por defecto):

```json
"social": {
  "enabled": true,
  "includeLinkInX": false,
  "hashtags": ["investing", "stocks", "stockmarket", "ETFs"]
}
```

- `enabled: false` — desactiva toda la publicación social independientemente de las credenciales.
- `includeLinkInX` — incluye el enlace de análisis en las publicaciones de X. Desactivado por defecto porque un enlace aumenta el costo por uso de X.
- `hashtags` — hashtags genéricos añadidos en Facebook / Threads / LinkedIn (el `#` inicial es opcional). No se añaden en X.

Cada plataforma se controla **además** con sus propias credenciales, así que una plataforma sin claves se omite incluso cuando `enabled` es `true`.

---

## Resumen de secrets
{: .text-green-200}

Agrega estos como **Secrets** del repositorio (Settings → Secrets and variables → Actions → **Secrets**). Todos son opcionales — configura solo las plataformas que quieras.

| Secret | Plataforma | Notas |
|---|---|---|
| `FACEBOOK_PAGE_ID` | Facebook | El id numérico de tu página |
| `FACEBOOK_PAGE_TOKEN` | Facebook | Token de acceso de página de larga duración |
| `THREADS_USER_ID` | Threads | El id numérico de tu usuario de Threads |
| `THREADS_ACCESS_TOKEN` | Threads | Token de larga duración (expira en ~60 días) |
| `THREADS_TOKEN_PAT` | Threads | PAT opcional para refrescar automáticamente el token de Threads (ver abajo) |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn | Token OAuth 2.0 con `w_organization_social` |
| `LINKEDIN_ORG_URN` | LinkedIn | p. ej. `urn:li:organization:123456` |
| `X_API_KEY` / `X_API_SECRET` | X/Twitter | Claves de consumidor OAuth 1.0a |
| `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | X/Twitter | Tokens de usuario OAuth 1.0a |

---

## Configuración de página de Facebook
{: .text-green-200}

El runtime necesita solo dos valores: `FACEBOOK_PAGE_ID` y un `FACEBOOK_PAGE_TOKEN` de **larga duración**. Como publicas en **tu propia página como su administrador**, puedes permanecer en el **modo de desarrollo** de la app — no se requiere App Review.

**1. Crear una app de Meta**

1. Ve a [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Elige el tipo de app **Other** → **Business** y nómbrala (p. ej. "Richfolio Poster").

**2. Agregar el caso de uso de gestión de página**

1. En la app, abre **Use cases** → elige **Manage everything on your Page**.
2. Abre sus **Permissions** y haz **Add** (Standard Access es suficiente — ignora "Get Advanced Access"):
   - `pages_manage_posts` — publica en el feed (el esencial)
   - `pages_read_engagement`
   - `pages_show_list`

   Deberían mostrar **"Ready for testing"** — eso significa que ya puedes usarlos como administrador.

**3. Obtener un token de usuario**

1. Abre el [Graph API Explorer](https://developers.facebook.com/tools/explorer).
2. Selecciona tu app → **Get User Access Token** → marca los tres permisos `pages_*` → **Generate Access Token** → aprueba.

**4. Generar un token de página de larga duración**

Richfolio incluye un helper que hace el intercambio del token por ti. Agrega temporalmente a `.env`:

```bash
FACEBOOK_PAGE_ID=your_page_id          # numeric Page id
FACEBOOK_APP_SECRET=...                # App settings → Basic → App secret
FB_USER_TOKEN=...                      # the user token from step 3
```

Luego ejecuta:

```bash
npx tsx smoke/fb-page-token.ts
```

Intercambia el token de usuario de corta duración por uno de larga duración, encuentra tu página e imprime un **token de página que no expira**. Pega ese valor en `FACEBOOK_PAGE_TOKEN`, luego **elimina** `FACEBOOK_APP_SECRET` y `FB_USER_TOKEN` de `.env` — son solo para la configuración y nunca se usan en runtime.

**5. Verificar**

```bash
npx tsx smoke/smoke-facebook.ts             # checks the token (no posting)
npx tsx smoke/smoke-facebook.ts --post --cleanup   # posts a test, then deletes it
```

Un `PASS` confirma que el token es un token de página válido y que la publicación funciona de extremo a extremo.

**6. Agregar a GitHub**

Agrega `FACEBOOK_PAGE_ID` y `FACEBOOK_PAGE_TOKEN` como Secrets del repositorio. **No** agregues el app secret ni el token de usuario.

> **Longevidad del token:** el token de página es prácticamente permanente, pero deja de funcionar si cambias tu contraseña de Facebook, revocas la app o dejas de ser administrador de la página. Si la publicación se detiene, vuelve a generarlo desde el paso 3.

---

## Configuración de Threads
{: .text-green-200}

Threads reutiliza la **misma app de Meta** que Facebook. Necesitas un `THREADS_USER_ID` y un `THREADS_ACCESS_TOKEN` de larga duración. La cuenta que autorices es desde la que aparecen las publicaciones — usa tu cuenta de marca en Threads, que debe ser **pública**.

**1. Agregar el caso de uso de Threads** a la app de Meta: **Use cases** → **Access the Threads API**. Habilita los scopes `threads_basic` y `threads_content_publish`.

**2. Agrégate como Threads Tester**: App Dashboard → **App roles → Roles** → **Add People** → **Threads Tester** → ingresa tu nombre de usuario de Threads → acepta la invitación en la app de Threads (Settings → Account → Website permissions).

**3. Generar un token de larga duración**: en los **Settings** del caso de uso de Threads, el **User Token Generator** lista tu cuenta de tester → **Generate token**. Este ya es de larga duración — no hace falta intercambio. Pégalo en `.env` como `THREADS_ACCESS_TOKEN`.

**4. Descubrir tu user id y verificar**:

```bash
npx tsx smoke/smoke-threads.ts             # prints THREADS_USER_ID; set it in .env
npx tsx smoke/smoke-threads.ts --post --cleanup   # posts a test (delete may be manual)
```

**5. Agrega `THREADS_USER_ID` y `THREADS_ACCESS_TOKEN` a los Secrets de GitHub.**

> **Expiración del token y auto-refresco:** los tokens de larga duración de Threads expiran en **~60 días**. El workflow `.github/workflows/refresh-threads-token.yml` refresca el token mensualmente y lo escribe de vuelta en el secret — *si* además agregas un secret `THREADS_TOKEN_PAT` (un PAT de grano fino con permiso de repositorio **Secrets: Read and write**). Sin ese PAT, refresca el token manualmente antes de que expire. Cuando el token está configurado pero falta ese PAT, el workflow ahora **falla de forma explícita** en lugar de pasar en silencio: fue precisamente ese silencio lo que permitió que tres ejecuciones mensuales en verde ocultaran un token caducado.

---

## Configuración de página de LinkedIn
{: .text-green-200}

LinkedIn es gratuito pero el más restringido. Necesitas:

1. Una **app de desarrollador** de LinkedIn asociada a tu página de empresa.
2. El producto **"Community Management API"**, que otorga el scope `w_organization_social`. Solicitarlo requiere que la asociación de empresa de tu app esté **verificada** (pestaña Settings) y el envío de un formulario de acceso (pide un nombre de empresa registrado).
3. Un **token de acceso** OAuth 2.0 con `w_organization_social`, generado por un **administrador de la página**.

Configura:

- `LINKEDIN_ACCESS_TOKEN` — el token OAuth 2.0.
- `LINKEDIN_ORG_URN` — el URN de tu organización, p. ej. `urn:li:organization:123456` (el número está en la URL de tu página de empresa).
- `LINKEDIN_API_VERSION` — sobrescritura opcional (por defecto un `YYYYMM` reciente).

Verifica con `npx tsx smoke/smoke-linkedin.ts` (verificación del token) y `--post --cleanup` (prueba de publicación).

> Los tokens de acceso de LinkedIn expiran en ~60 días (los refresh tokens duran ~365). Planea refrescarlos periódicamente. Publicar en una organización requiere una empresa registrada; si no tienes una, puedes adaptar el publicador para publicar desde un perfil personal vía el producto autoservicio "Share on LinkedIn" (`w_member_social`).

---

## Configuración de X / Twitter
{: .text-green-200}

> **X no tiene un nivel gratuito de publicación desde febrero de 2026.** La publicación es de pago por uso (~$0.015 por publicación, más si contiene un enlace). Richfolio incluye el publicador de X pero permanece inactivo hasta que agregues las claves.

La publicación usa **OAuth 1.0a en contexto de usuario**. En el [X Developer Portal](https://developer.x.com), crea un proyecto/app con permisos **Read and Write** y genera:

- `X_API_KEY` / `X_API_SECRET` — la clave y el secret de consumidor (API).
- `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` — el token de acceso y secret de tu cuenta.

Deja `includeLinkInX` desactivado en `config.json` para mantener bajo el costo por publicación.

---

## Cómo corre
{: .text-green-200}

En los modos diario e intradía, después de los envíos de correo y Telegram, Richfolio llama a `sendSocialPosts()` ([src/social.ts](https://github.com/furic/richfolio/blob/main/src/social.ts)). Cada plataforma publica dentro de su propio try/catch, así que el fallo de una plataforma nunca bloquea a las demás — ni al correo/Telegram que ya se envió.

Si haces un fork de Richfolio, la publicación social permanece **desactivada** hasta que completes la configuración anterior con **tus propias** cuentas — las credenciales no se pueden compartir, ya que cada token publica en la cuenta de su propietario.
