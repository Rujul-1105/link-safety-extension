const timestamp = () => new Date().toISOString().slice(11, 23)

export const logger = {
    info: (...args: unknown[]) => console.log(`\x1b[36m[${timestamp()}] INFO \x1b[0m`, ...args),
    warn: (...args: unknown[]) => console.log(`\x1b[33m[${timestamp()}] WARN \x1b[0m`, ...args),
    error: (...args: unknown[]) => console.log(`\x1b[31m[${timestamp()}] ERROR\x1b[0m`, ...args),
    debug: (...args: unknown[]) => process.env.NODE_ENV === 'development' && console.log(`\x1b[90m[${timestamp()}] DEBUG\x1b[0m`, ...args),
}