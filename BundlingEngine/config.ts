
import { 
    Connection, 
    Keypair 
} from "@solana/web3.js";
import {
    TxVersion
} from "@raydium-io/raydium-sdk";
import * as bs58 from "bs58";
import * as dotenv from "dotenv";


dotenv.config();

// define jito config
export const BLOCK_ENGINE_URL = "tokyo.mainnet.block-engine.jito.wtf";
const JITO_AUTH_PRIV_KEY = process.env.JITO_AUTH_PRIV_KEY || "";
const WALLET_2_PAY_JITO_FEES = process.env.WALLET_2_PAY_JITO_FEES || "";

const WALLET1_PRIV_KEY = process.env.WALLET1_PRIV_KEY || "";
const WALLET2_PRIV_KEY = process.env.WALLET2_PRIV_KEY || "";
const WALLET3_PRIV_KEY = process.env.WALLET3_PRIV_KEY || "";

export const RPC_HTTPS_URL = 
    /* clusterApiUrl(NETWORK) */
    /* 'https://solana-mainnet.g.alchemy.com/v2/j_0irTskpyfvy2WtK09VvhamD6IQWQjO' */
    /* 'https://mainnet.helius-rpc.com/?api-key=9a24f0cb-ba18-441e-9352-487b50301544' */    // From Client
    'https://mainnet.helius-rpc.com/?api-key=e0762009-5522-4263-a855-b8fc58a53dc9'
    ;
console.log('NetworkUrl:', RPC_HTTPS_URL);


// derived constants
export const jito_auth_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(JITO_AUTH_PRIV_KEY)));
export const wallet_2_pay_jito_fees_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(WALLET_2_PAY_JITO_FEES)));

export const wallet1_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(WALLET1_PRIV_KEY)));
export const wallet2_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(WALLET2_PRIV_KEY)));
export const wallet3_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(WALLET3_PRIV_KEY)));

export const lookupTableCache = {};
export const connection = new Connection(RPC_HTTPS_URL, "confirmed");
export const makeTxVersion = TxVersion.V0; // LEGACY
export const addLookupTableInfo = undefined; // only mainnet, else undefined
