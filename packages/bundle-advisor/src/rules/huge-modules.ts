import type { Issue, Module } from '../types.js'
import { formatBytes, generateIssueId, type Rule } from './engine.js'

const RULE_ID = 'huge-modules'

export type HugeModulesRuleConfig = {
  maxModuleSize?: number
}

/**
 * Rule: Detect individual modules that are unusually large
 *
 * This rule aggregates modules by package name and estimates the actual
 * bundled size by calculating the proportion of chunks consumed by each package.
 */
export const createHugeModulesRule =
  (config?: HugeModulesRuleConfig): Rule =>
  bundleStats => {
    const MAX_SIZE = config?.maxModuleSize ?? 200 * 1024 // 200KB
    const issues: Issue[] = []

    // Pre-compute package data and chunk source sizes in a single pass
    const packageSizes = new Map<
      string,
      {
        totalSourceSize: number
        moduleIds: string[]
        chunkIds: Set<string>
        sourcePerChunk: Map<string, number>
        importPaths: Set<string>
      }
    >()
    const individualModules: Module[] = []
    const chunkSourceSizes = new Map<string, number>()

    // Single pass through modules to aggregate all data
    for (const mod of bundleStats.modules.values()) {
      // Accumulate total source size per chunk
      for (const chunkId of mod.chunks) {
        chunkSourceSizes.set(chunkId, (chunkSourceSizes.get(chunkId) || 0) + mod.size)
      }

      if (mod.packageName) {
        const existing = packageSizes.get(mod.packageName)

        if (existing) {
          existing.totalSourceSize += mod.size
          existing.moduleIds.push(mod.id)
          for (const chunkId of mod.chunks) {
            existing.chunkIds.add(chunkId)
            existing.sourcePerChunk.set(
              chunkId,
              (existing.sourcePerChunk.get(chunkId) || 0) + mod.size,
            )
          }
        } else {
          const sourcePerChunk = new Map<string, number>()
          for (const chunkId of mod.chunks) {
            sourcePerChunk.set(chunkId, mod.size)
          }

          packageSizes.set(mod.packageName, {
            totalSourceSize: mod.size,
            moduleIds: [mod.id],
            chunkIds: new Set(mod.chunks),
            sourcePerChunk,
            importPaths: new Set(),
          })
        }

        // Extract import path if available
        if (mod.path) {
          const match = mod.path.match(new RegExp(`${mod.packageName}/(.*?)(?:\\?|$)`))
          if (match) {
            const importPath = `${mod.packageName}/${match[1]}`
            // Filter out internal implementation paths
            if (
              !importPath.includes('/cjs/') &&
              !importPath.includes('/esm/') &&
              !importPath.includes('.production') &&
              !importPath.includes('.development')
            ) {
              packageSizes.get(mod.packageName)?.importPaths.add(importPath)
            }
          }
        }
      } else {
        individualModules.push(mod)
      }
    }

    // Process aggregated packages
    for (const [packageName, data] of packageSizes.entries()) {
      // Calculate estimated bundled size using pre-computed data
      let estimatedBundledSize = 0

      for (const chunkId of data.chunkIds) {
        const chunk = bundleStats.chunks.get(chunkId)
        if (!chunk) continue

        const packageSourceInChunk = data.sourcePerChunk.get(chunkId) || 0
        const totalSourceInChunk = chunkSourceSizes.get(chunkId) || 1
        const proportion = packageSourceInChunk / totalSourceInChunk

        estimatedBundledSize += chunk.size * proportion
      }

      if (estimatedBundledSize <= MAX_SIZE) continue

      const severity = estimatedBundledSize > MAX_SIZE * 2 ? 'high' : 'medium'
      const importPaths = Array.from(data.importPaths).slice(0, 3)
      const importPathsDisplay =
        importPaths.length > 0 ? ` (imports: ${importPaths.join(', ')})` : ''

      issues.push({
        id: generateIssueId(RULE_ID, packageName),
        ruleId: RULE_ID,
        severity,
        title: `Huge module: ${packageName}${importPathsDisplay}`,
        description: `Module "${packageName}" is ${formatBytes(Math.round(estimatedBundledSize))} (estimated ${formatBytes(data.totalSourceSize)} before bundling). Consider replacing with a lighter alternative, tree-shaking unused code, or lazy loading this module.`,
        bytesEstimate: Math.round(estimatedBundledSize),
        affectedModules: data.moduleIds,
        fixType: 'replace-package',
        metadata: {
          packageName,
          estimatedBundledSize: Math.round(estimatedBundledSize),
          totalSourceSize: data.totalSourceSize,
          moduleCount: data.moduleIds.length,
          chunkCount: data.chunkIds.size,
          importPaths,
        },
      })
    }

    // Process individual modules
    for (const mod of individualModules) {
      let estimatedBundledSize = 0

      for (const chunkId of mod.chunks) {
        const chunk = bundleStats.chunks.get(chunkId)
        if (!chunk) continue

        const totalSourceInChunk = chunkSourceSizes.get(chunkId) || 1
        const proportion = mod.size / totalSourceInChunk
        estimatedBundledSize += chunk.size * proportion
      }

      if (estimatedBundledSize <= MAX_SIZE) continue

      const severity = estimatedBundledSize > MAX_SIZE * 2 ? 'high' : 'medium'

      issues.push({
        id: generateIssueId(RULE_ID, mod.id),
        ruleId: RULE_ID,
        severity,
        title: `Huge module: ${mod.path || mod.id}`,
        description: `Module "${mod.path || mod.id}" is ${formatBytes(Math.round(estimatedBundledSize))} (estimated ${formatBytes(mod.size)} before bundling). Consider optimizing imports or lazy loading this module.`,
        bytesEstimate: Math.round(estimatedBundledSize),
        affectedModules: [mod.id],
        fixType: 'optimize-imports',
        metadata: {
          moduleId: mod.id,
          modulePath: mod.path,
          estimatedBundledSize: Math.round(estimatedBundledSize),
          totalSourceSize: mod.size,
        },
      })
    }

    return issues
  }
