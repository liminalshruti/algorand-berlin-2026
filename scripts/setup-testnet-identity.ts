import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import algosdk from 'algosdk'

const DEFAULT_IDENTITY_APP_ID = '764031067'
const DEFAULT_ALGOD_URL = 'https://testnet-api.algonode.cloud'
const DEFAULT_ALGOD_PORT = 443
const MICROALGO = 1_000_000
const MIN_REGISTRATION_BALANCE_ALGO = 2

type Env = Record<string, string | undefined>

const args = new Set(process.argv.slice(2))
const force = args.has('--force')
const checkOnly = args.has('--check')
const envPath = resolve(process.cwd(), '.env')

function readEnvFile(): { text: string; parsed: Env } {
  const text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  return { text, parsed: parse(text) }
}

function upsertEnvLine(text: string, key: string, value: string): string {
  const line = `${key}=${JSON.stringify(value)}`
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm')
  if (pattern.test(text)) return text.replace(pattern, line)
  const prefix = text.length === 0 || text.endsWith('\n') ? text : `${text}\n`
  return `${prefix}${line}\n`
}

function writeLocalIdentityEnv(text: string, mnemonic: string): void {
  let next = upsertEnvLine(text, 'IDENTITY_APP_ID', DEFAULT_IDENTITY_APP_ID)
  next = upsertEnvLine(next, 'IDENTITY_SUBMITTER_MNEMONIC', mnemonic)
  writeFileSync(envPath, next, { mode: 0o600 })
  chmodSync(envPath, 0o600)
}

async function readBalance(address: string, env: Env): Promise<{ balanceAlgo: number; exists: boolean } | null> {
  const client = new algosdk.Algodv2(
    env.ALGOD_TOKEN ?? '',
    env.ALGOD_URL ?? DEFAULT_ALGOD_URL,
    Number(env.ALGOD_PORT ?? DEFAULT_ALGOD_PORT),
  )

  try {
    const account = await client.accountInformation(address).do()
    return { balanceAlgo: Number(account.amount ?? 0) / MICROALGO, exists: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('account does not exist')) return { balanceAlgo: 0, exists: false }
    console.warn(`Balance check skipped: ${message}`)
    return null
  }
}

async function main(): Promise<void> {
  const { text, parsed } = readEnvFile()
  let mnemonic = parsed.IDENTITY_SUBMITTER_MNEMONIC?.trim()
  let created = false

  if (checkOnly && !mnemonic) {
    throw new Error('IDENTITY_SUBMITTER_MNEMONIC is missing from local .env')
  }

  if (!mnemonic || force) {
    const account = algosdk.generateAccount()
    mnemonic = algosdk.secretKeyToMnemonic(account.sk)
    writeLocalIdentityEnv(text, mnemonic)
    created = true
  } else if (parsed.IDENTITY_APP_ID !== DEFAULT_IDENTITY_APP_ID) {
    writeLocalIdentityEnv(text, mnemonic)
  }

  const address = algosdk.mnemonicToSecretKey(mnemonic).addr.toString()
  const updatedEnv = readEnvFile().parsed
  const balance = await readBalance(address, updatedEnv)

  console.log(created ? 'Created TestNet identity operator.' : 'Using existing TestNet identity operator.')
  console.log(`IDENTITY_APP_ID=${updatedEnv.IDENTITY_APP_ID ?? DEFAULT_IDENTITY_APP_ID}`)
  console.log(`IDENTITY_SUBMITTER_ADDRESS=${address}`)
  console.log('IDENTITY_SUBMITTER_MNEMONIC=present in local .env')

  if (balance) {
    console.log(`IDENTITY_SUBMITTER_BALANCE_ALGO=${balance.balanceAlgo}`)
    if (!balance.exists || balance.balanceAlgo < MIN_REGISTRATION_BALANCE_ALGO) {
      console.log('\nFund this address with TestNet ALGO:')
      console.log(`algokit dispenser fund --receiver ${address} --amount ${MIN_REGISTRATION_BALANCE_ALGO} --whole-units`)
      console.log('\nAfter funding, re-run:')
      console.log('npm run setup:testnet-identity -- --check')
      console.log('\nWhen the check shows enough balance, register known agents with:')
      console.log('npm run register:testnet-agents')
    } else {
      console.log('\nReady to register known Honest/Cheat agents:')
      console.log('npm run register:testnet-agents')
    }
  } else {
    console.log('\nBalance could not be confirmed; after funding, re-run:')
    console.log('npm run setup:testnet-identity -- --check')
  }

  console.log('\nThis setup command only prepares/checks the identity operator; it does not register agents.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
