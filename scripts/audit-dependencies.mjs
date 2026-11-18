// Keep pull-request security checks strict while the upstream picomatch
// advisory has no patched release. The exception is ONLY for this known,
// development-only dependency chain; future advisories still fail CI.
import { spawnSync } from 'node:child_process'

const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'
const knownChain = new Set(['picomatch', 'fdir', 'tinyglobby', 'vite'])
const highSeverity = new Set(['high', 'critical'])

export function isKnownBuildOnlyFinding(name, finding) {
 if (!knownChain.has(name) || finding.severity !== 'high') return false
 if (!Array.isArray(finding.via) || finding.via.length === 0) return false
 return finding.via.every(reason =>
  typeof reason === 'string'
   ? knownChain.has(reason) && reason !== name
   : reason?.name === 'picomatch' && reason?.url === advisory
 )
}

function audit(extraArgs = []) {
 const isWindows = process.platform === 'win32'
 // All subcommand arguments are fixed literals; avoid shell:true on Windows.
 const command = isWindows ? 'cmd.exe' : 'npm'
 const args = isWindows
  ? ['/d', '/s', '/c', `npm audit --json ${extraArgs.join(' ')}`]
  : ['audit', '--json', ...extraArgs]
 const result = spawnSync(command, args, {
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
 })
 if (result.error) throw result.error
 let report
 try { report = JSON.parse(result.stdout) }
 catch { throw new Error('npm audit did not return valid JSON; security check cannot be skipped') }
 if (report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities)
  throw new Error('npm audit was incomplete; security check cannot be skipped')
 return report
}

try {
 // Public GitHub Pages bundles must not inherit known high-severity runtime risks.
 const production = audit(['--omit=dev'])
 const prodCounts = production.metadata.vulnerabilities
 if (prodCounts.high || prodCounts.critical)
  throw new Error('Production dependencies contain high-severity advisories')

 const full = audit()
 const findings = Object.entries(full.vulnerabilities)
  .filter(([, value]) => highSeverity.has(value.severity))
 const unexpected = findings.filter(([name, value]) => !isKnownBuildOnlyFinding(name, value))
 if (unexpected.length)
  throw new Error('Unexpected high-severity advisory in: ' +
   unexpected.map(([name]) => name).join(', '))
 if (findings.length)
  console.warn('WARNING: ' + findings.length +
   ' known build-only findings from picomatch GHSA-fc5q-39xc-vjpf. ' +
   'No patched picomatch release is available; continue monitoring upstream.')
 console.log('PASS: production audit clean; no unexpected high-severity dependency advisories')
} catch (error) {
 console.error('FAIL: dependency security audit:', error instanceof Error ? error.message : error)
 process.exitCode = 1
}
