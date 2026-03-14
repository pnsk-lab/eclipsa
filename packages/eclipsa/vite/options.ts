export type EclipsaOutputTarget = 'node' | 'ssg'

export interface EclipsaPluginOptions {
  output?: EclipsaOutputTarget
}

export interface ResolvedEclipsaPluginOptions {
  output: EclipsaOutputTarget
}

export const resolveEclipsaPluginOptions = (
  options?: EclipsaPluginOptions,
): ResolvedEclipsaPluginOptions => ({
  output: options?.output ?? 'node',
})
