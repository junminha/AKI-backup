# AKI deployment map

Deploy each directory as a separate site from the private
`junminha/AKI-backup` repository.

| Directory | Platform | Dashboard directory setting |
| --- | --- | --- |
| `----` | Vercel | Root Directory: `----` |
| `ExpressionLab` | Vercel | Root Directory: `ExpressionLab` |
| `PosePop` | Vercel | Root Directory: `PosePop` |
| `avatar-studio` | Netlify | Base directory: `avatar-studio` |
| `PosePersonaCharacter` | Netlify | Base directory: `PosePersonaCharacter` |
| `perfect-poses-wall-prototype` | Netlify | Base directory: `perfect-poses-wall-prototype` |
| `mediapipe-playground` | Netlify | Base directory: `mediapipe-playground` |

## Vercel environment variables

Copy values from the local `.env` files into the Vercel project settings.
Never commit the local `.env` files.

### ExpressionLab

- `GROQ_API_KEY` (required)
- `GROQ_VISION_MODEL` (optional)
- `GROQ_DAILY_LIMIT` (optional)
- `GROQ_RATE_WINDOW_MS` (optional)
- `GROQ_RATE_MAX` (optional)
- `ENABLE_HSTS=true` (recommended for production)

### PosePop

- `GROQ_API_KEY` (required for analysis)
- `OPENAI_API_KEY` (required for image generation)
- `GROQ_VISION_MODEL` (optional)
- `OPENAI_IMAGE_MODEL` (optional)

Vercel supplies `PORT` and `NODE_ENV`; do not copy the local `PORT` value.

## Netlify settings

The `netlify.toml` in each project supplies the build command and publish
directory. Netlify provides HTTPS automatically, which is required for browser
camera access outside `localhost`.
