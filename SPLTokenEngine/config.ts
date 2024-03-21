import { 
    Connection, 
    Keypair, 
    PublicKey, 
    clusterApiUrl, 
} from "@solana/web3.js";

import { 
    Token, 
    TxVersion, 
    TOKEN_PROGRAM_ID, 
    MAINNET_PROGRAM_ID,
    DEVNET_PROGRAM_ID, 
    LOOKUP_TABLE_CACHE,
} from "@raydium-io/raydium-sdk";

import bs58 from "bs58";
import dotenv from "dotenv";


dotenv.config();

export const isMainNet = process.env.IS_MAINNET === "true";
export const OWNER_PRIV_KEY = process.env.OWNER_PRIV_KEY || "";


export const PROGRAMIDS = isMainNet ? MAINNET_PROGRAM_ID : DEVNET_PROGRAM_ID;
export const NETWORK = isMainNet ? "mainnet-beta" : "devnet";
export const addLookupTableInfo = isMainNet ? LOOKUP_TABLE_CACHE : undefined;

export const networkUrl = !isMainNet ? clusterApiUrl(NETWORK) : 
    (
        /* clusterApiUrl(NETWORK) */
        /* 'https://solana-mainnet.g.alchemy.com/v2/j_0irTskpyfvy2WtK09VvhamD6IQWQjO' */
        /* 'https://mainnet.helius-rpc.com/?api-key=9a24f0cb-ba18-441e-9352-487b50301544' */    // From Client
        'https://mainnet.helius-rpc.com/?api-key=e0762009-5522-4263-a855-b8fc58a53dc9'
    );
console.log('NetworkUrl:', networkUrl);
export const connection = new Connection(networkUrl, "confirmed");

export const WALLET = Keypair.fromSecretKey(bs58.decode(OWNER_PRIV_KEY));

export const payer = WALLET;
export const mintAuthority = WALLET;
export const updateAuthority = WALLET;
export const buyerOrSeller = WALLET;

export const makeTxVersion = TxVersion.V0; // LEGACY


export const DEFAULT_TOKEN = {
    'WSOL': new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'WSOL'),
    'USDC': new Token(TOKEN_PROGRAM_ID, 
        new PublicKey(isMainNet ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : 'EmXq3Ni9gfudTiyNKzzYvpnQqnJEMRw2ttnVXoJXjLo1'), 
        6, isMainNet ? 'USDC' : 'USDC-DEV', isMainNet ? 'USD Coin' : 'USDC Dev'),
};
