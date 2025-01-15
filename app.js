import { Webhooks, createNodeMiddleware } from '@octokit/webhooks'
import { exec as execute, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import morgan from 'morgan'
import express from 'express'
import ini from 'ini'

const exec = promisify(execute)

const {
  GIT_URL,
  WEBHOOK_SECRET,
  PORT = 7860,
} = process.env

const CONFIG_FILE = 'hf.conf' //TODO: mv to env
const REPO_NAME = extractRepoName(GIT_URL)

let childProcess = null
let config = null
let env = {}

const webhooks = new Webhooks({ secret: WEBHOOK_SECRET })
const logApp = createLogger('App')
const logWebhook = createLogger('Webhook')

if (!REPO_NAME) {
  logApp('error', 'Please provide $GIT_URL environment variable.')
  process.exit(1)
}

if (!WEBHOOK_SECRET) {
  logApp('error', 'Please provide $WEBHOOK_SECRET environment variable.')
  process.exit(1)
}

function extractRepoName(url) {
  if (!url) return null
  const name = url.split('/').pop()
  return name.endsWith('.git') ? name.slice(0, -4) : name
}

function formatDate(date) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }
  return new Date(date).toLocaleString('en-US', options).replace(',', '')
}

function createLogger(context) {
  return (level, message) => {
    const timestamp = formatDate(new Date())
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}`)
  }
}

async function executeCommand(command, cwd = REPO_NAME) {
  try {
    logApp('info', `Executing: ${command}`)
    const { stdout, stderr } = await exec(command, { cwd })
    if (stdout) console.log(stdout)
    if (stderr) console.error(stderr)
    return true
  } catch (error) {
    logApp('error', `Command failed: ${command} - ${error.message}`)
    return false
  }
}

async function cloneRepository() {
  logApp('info', 'Cloning repository...')
  return await executeCommand(`git clone ${GIT_URL}`, '.')
}

async function pullLatestChanges() {
  logApp('info', 'Pulling latest changes...')
  return await executeCommand('git pull')
}

async function runSetupScripts(scripts) {
  logApp('info', 'Running setup scripts...')
  for (const script of scripts) {
    const success = await executeCommand(script)
    if (!success) return false
  }
  return true
}

async function buildApplication() {
  logApp('info', 'Building application...')
  if (!config) {
    logApp('error', 'Configuration not loaded. Please clone the repository before building the application.')
    return false
  }
  if (!(await pullLatestChanges())) return false
  if (!(await runSetupScripts(config.script))) return false
  return true
}

function validateConfig(config) {
  if (!config) throw new Error("No config found in config file.")
  if (!config.command) throw new Error("No Command found in config file.")
  if (!config.script) throw new Error("No script for setup installation found in config file.")
}

async function loadConfiguration(filename) {
  try {
    const { stdout } = await exec(`cat ${filename}`, { cwd: REPO_NAME })
    const obj = ini.parse(stdout)
    validateConfig(obj.config)
    config = obj.config
    env = obj.env || {}
    return true
  } catch (error) {
    logApp('error', `Failed to load configuration from ${filename}: ${error.message}`)
    return false
  }
}

async function startApplication(build = false) {
  if (childProcess) {
    logApp('info', 'Restarting application...')
    childProcess.kill()
    childProcess = null
  } else {
    logApp('info', 'Starting application...')
    if (!(await cloneRepository())) return
  }

  if (build) {
    if (!(await loadConfiguration(CONFIG_FILE))) return
    if (!(await buildApplication())) return
  }
  
  const [command, ...args] = config.command.split(' ')
  logApp('info', `Executing command: ${config.command}`)
  
  childProcess = spawn(command, args, {
    env: { ...process.env, ...env },
    cwd: REPO_NAME,
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  })

  childProcess.on('message', async (msg) => {
    const action = msg.trim()
    if (action === 'reset') {
      await startApplication()
    } else if (action === 'build') {
      await startApplication(true)
    } else if (action === 'pull') {
      await pullLatestChanges()
    } else if (action === 'setup') {
      await runSetupScripts(config.script)
    }
  })

}

webhooks.onAny((event) => {
  logWebhook('info', `Received event: ${event.name} with ID: ${event.id}`)
  if (childProcess && event.name === 'push') {
    childProcess.send('push='+JSON.stringify(events))
    childProcess.emit('message', 'build')
  }
})

function initializeServer() {
  const app = express()
  const middleware = createNodeMiddleware(webhooks, { path: '/webhook' })

  app.use(morgan('combined'))
  app.use(middleware)

  app.get('/', (req, res) => {
    res.json({ status: 'active' })
  })

  app.listen(PORT, () => {
    logApp('info', `Server listening on port ${PORT}`)
  })
}

initializeServer()
startApplication(true)
