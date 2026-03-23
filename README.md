# NhzAI

AI-powered project discovery and planning for NineHertz (React + TypeScript + Vite, Express backend).

## Requirements

- **Node.js 20 or later** (Vite 7 and the backend need it). Check with `node -v`.
- **MongoDB running locally** on `mongodb://127.0.0.1:27017` unless you set `MONGODB_URI`.
- If you have Node 18: install [Node 20+](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm): `nvm install 20 && nvm use 20`.
- If you use `nvm`, `npm run dev` will try to use Node 20 automatically.

---

## Local Setup

1. Copy `.env.example` to `.env`.
2. Start MongoDB locally.
3. Run `npm install`.
4. Run `npm run dev`.

### Default local admin config

If `MONGODB_URI` is not set, the backend falls back to local MongoDB:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
ADMIN_DB_NAME=nhz_ai_admin
```

Admin users are stored in the `nhz_ai_admin` database in the `admin_users` collection.

## Notes

- `.env` is gitignored and should hold real local secrets only.
- Keep `.env.example` placeholder-only.
- In production, prefer host/platform environment variables instead of checked-in secret files.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
