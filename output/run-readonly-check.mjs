import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
const [label,cwd,...args] = process.argv.slice(2)
if (!/^[\w-]+$/.test(label || '') || !cwd || !args.length) throw new Error('Expected label cwd pnpm-arguments')
const logPath = path.resolve('output',`readonly-${label}.log`)
const output = fs.openSync(logPath,'w')
const child = spawn(process.execPath,[path.resolve('node_modules/pnpm/bin/pnpm.cjs'),...args],{cwd,stdio:['ignore',output,output],env:{...process.env,FORCE_COLOR:'0'}})
child.on('error',(error) => { console.log(`${label}: ${error.message}`); process.exitCode=1 })
child.on('close',(code) => {
  fs.closeSync(output)
  const log = fs.readFileSync(logPath,'utf8')
  const lines = log.split(/\r?\n/).filter((line) => /Test Files|Tests:|Tests\s+\d|Test Suites|FAIL|failed\)|error TS|AssertionError|Error:|✖|error\s/.test(line))
  console.log(JSON.stringify({label,exitCode:code,log:logPath,summary:lines.slice(-30)}))
  process.exitCode=code || 0
})
