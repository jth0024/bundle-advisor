import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dedent from 'dedent'
import type { AIEnhancedBundleAnalysis, BundleAnalysis, IssueSeverity } from '../types.js'
import { capitalize } from '../utils/capitalize.js'
import { formatBytes } from '../utils/format-bytes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function generateHtmlReport(analysis: BundleAnalysis | AIEnhancedBundleAnalysis) {
  return dedent`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Bundle Analysis Report</title>
        <link rel="stylesheet" href="${resolve(__dirname, '../index.css')}" />
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1, h2, h3 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f4f4f4; }
          .high { color: red; }
          .medium { color: orange; }
          .low { color: green; }
        </style>
      </head>
      <body>
        <h1 class="text-2xl">Bundle Analysis Report</h1>
        <h2>Overview</h2>
        <ul>
          <li><strong>Total Size:</strong> ${formatBytes(analysis.stats.totalAssetsSize)}</li>
          <li><strong>Initial Size:</strong> ${formatBytes(analysis.stats.initialChunksSize)}</li>
          <li><strong>Assets:</strong> ${analysis.assets.size}</li>
          <li><strong>Chunks:</strong> ${analysis.chunks.size}</li>
          <li><strong>Packages:</strong> ${analysis.packages.size}</li>
          <li><strong>Modules:</strong> ${analysis.modules.size}</li>
        </ul>
        ${renderPotentialSavings(analysis)}
        ${renderAISummary(analysis as AIEnhancedBundleAnalysis)}
        ${renderAITopRecommendations(analysis as AIEnhancedBundleAnalysis)}
        ${
          analysis.issues.length === 0
            ? '<h2>No issues found! Your bundle looks great.</h2>'
            : '<h2>Issues</h2>'
        }
        ${renderIssuesBySeverity(analysis, 'high')}
        ${renderIssuesBySeverity(analysis, 'medium')}
        ${renderIssuesBySeverity(analysis, 'low')}
      </body>
    </html>
  `
}

function renderPotentialSavings(analysis: BundleAnalysis): string {
  // Potential savings
  let potentialSavings = 0
  for (const issue of analysis.issues) {
    potentialSavings += issue.bytesEstimate || 0
  }

  if (potentialSavings === 0) {
    return ''
  }

  return dedent`
    <h3>Potential Savings</h3>
    <p>${formatBytes(potentialSavings)} (estimated)</p>
  `
}

function renderAISummary(analysis: AIEnhancedBundleAnalysis): string {
  if (!analysis.aiSummary) {
    return ''
  }

  return dedent`
    <h2>AI Summary</h2>
    <p>${analysis.aiSummary}</p>
  `
}

function renderAITopRecommendations(analysis: AIEnhancedBundleAnalysis): string {
  if (!analysis.aiTopRecommendations || analysis.aiTopRecommendations.length === 0) {
    return ''
  }

  const listItems = analysis.aiTopRecommendations.map(rec => `<li>${rec}</li>`)

  return dedent`
    <h2>Top Recommendations</h2>
    <ol>
      ${listItems.join('\n')}
    </ol>
  `
}

function renderIssuesBySeverity(analysis: BundleAnalysis, severity: IssueSeverity): string {
  const issues = analysis.issues.filter(i => i.severity === severity)
  if (issues.length === 0) {
    return ''
  }

  const issueRows = issues.map(
    issue => dedent`
    <tr>
      <td>${issue.title}</td>
      <td>${issue.description}</td>
      <td>${issue.bytesEstimate ? formatBytes(issue.bytesEstimate) : 'N/A'}</td>
    </tr>
  `,
  )

  return dedent`
    <h3>${capitalize(severity)} Priority Issues</h2>
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Description</th>
          <th>Estimated Savings</th>
        </tr>
      </thead>
      <tbody>
        ${issueRows.join('\n')}
      </tbody>
    </table>
  `
}
