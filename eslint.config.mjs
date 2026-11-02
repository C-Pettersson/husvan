import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

const eslintConfig = [
  // .claude holds the desktop app's worktrees, each a copy of the repo.
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.claude/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
]

export default eslintConfig
