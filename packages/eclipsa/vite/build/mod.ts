import { build as viteBuild, mergeConfig, type UserConfig, type InlineConfig } from 'vite'

export const build = async (config: UserConfig) => {
  const built = await viteBuild(mergeConfig(config, {
    configFile: false,
    build: {
      rollupOptions: {
        input: '/app/+page.tsx'
      }
    }
  } satisfies InlineConfig))
}
