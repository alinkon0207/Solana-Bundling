
import { 
    PublicKey, 
    Keypair 
} from "@solana/web3.js";
import { unpackMint } from "@solana/spl-token";
import {
    jsonInfo2PoolKeys, 
    Liquidity, 
    MAINNET_PROGRAM_ID, 
    MARKET_STATE_LAYOUT_V3, LiquidityPoolKeys, 
    Token, TokenAmount, ZERO, ONE, TEN, 
    TOKEN_PROGRAM_ID, parseBigNumberish, bool
} from "@raydium-io/raydium-sdk";
import {
    PROGRAM_ID, 
    Metadata, 
} from "@metaplex-foundation/mpl-token-metadata";
import * as bs58 from "bs58";

import {
    connection, 
    lookupTableCache, 
    delay_pool_open_time, 
} from "./config";
import {
    getTokenAccountBalance, 
    assert, 
    getWalletTokenAccount, 
} from "./utils/get_balance";
import { build_create_pool_instructions, build_swap_instructions } from "./utils/build_a_sendtxn";
import { bull_dozer } from "./jito_bundle/send-bundle";


type WalletTokenAccounts = Awaited<ReturnType<typeof getWalletTokenAccount>>;


const LP_WALLET_KEYPAIR = process.env.LP_WALLET_KEYPAIR || "";
const SWAP_WALLET_KEYPAIR = process.env.SWAP_WALLET_KEYPAIR || "";

const LP_wallet_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(LP_WALLET_KEYPAIR)));
const swap_wallet_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(SWAP_WALLET_KEYPAIR)));

const market_id = new PublicKey("HXRdnsKETAGUeoErjhi8Eiy29bMbTKGi3XiY944urd6w"); // Must be fixed
const input_baseMint_tokens_percentage = 0.8;   // Mint amount of tokens you want to add in Lp, e.g. 1 = 100%, 0.9= 90%
const quote_Mint_amount = 0.5; // amount of SOL u want to add to Pool amount

const swap_sol_amount = 0.5;    // Amount of SOL u want to invest

const DEFAULT_TOKEN = {
    WSOL: new Token(TOKEN_PROGRAM_ID, new PublicKey('So11111111111111111111111111111111111111112'), 9, 'WSOL', 'WSOL'), 
    USDC: new Token(TOKEN_PROGRAM_ID, new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 6, 'USDC', 'USDC'), 
};


export async function getTokenMetadata(mintPublicKey: PublicKey): Promise<Metadata> {
    const [metadataPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from("metadata"),
            PROGRAM_ID.toBuffer(),
            mintPublicKey.toBuffer()
        ],
        PROGRAM_ID
    );
  
    // Derive the metadata account public key
    const metadata = await Metadata.fromAccountAddress(connection, metadataPDA);
  
    // // Access metadata properties
    // console.log("Metadata Name:", metadata.data.name);
    // console.log("Metadata Symbol:", metadata.data.symbol);
    // console.log("Metadata URI:", metadata.data.uri);

    return metadata;
}

async function txCreateAndInitNewPool() {
    console.log("LP Wallet addrerss:", LP_wallet_keypair.publicKey.toString());

    // ------- get pool keys
    console.log("------------- get pool keys for pool creation ---------");

    const tokenAccountRawInfos_LP = await getWalletTokenAccount(
        connection, 
        LP_wallet_keypair.publicKey
    );

    const tokenAccountRawInfos_Swap = await getWalletTokenAccount(
        connection, 
        swap_wallet_keypair.publicKey
    );

    const marketBufferInfo = await connection.getAccountInfo(market_id);
    if (!marketBufferInfo) return;

    const {
        baseMint, 
        quoteMint, 
        baseVault: marketBaseVault, 
        quoteVault: marketQuoteVault, 
        bids: marketBids, 
        asks: marketAsks, 
        eventQueue: marketEventQueue
    } = 
        MARKET_STATE_LAYOUT_V3.decode(marketBufferInfo.data);
    console.log("Base minit:", baseMint.toString());
    console.log("Quote mint:", quoteMint.toString());
    
    const accountInfo_base = await connection.getAccountInfo(baseMint);
    if (!accountInfo_base) return;

    const baseTokenProgramId = accountInfo_base.owner;
    const baseDecimals = unpackMint(
        baseMint, 
        accountInfo_base, 
        baseTokenProgramId
    ).decimals;
    console.log("Base Decimals:", baseDecimals);

    const accountInfo_quote = await connection.getAccountInfo(quoteMint);
    if (!accountInfo_quote) return;

    const quoteTokenProgramId = accountInfo_quote.owner;
    const quoteDecimals = unpackMint(
        quoteMint, 
        accountInfo_quote, 
        quoteTokenProgramId
    ).decimals;
    console.log("Quote Decimals:", quoteDecimals);

    const associatedPoolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4, 
        marketVersion: 3, 
        baseMint, 
        quoteMint, 
        baseDecimals, 
        quoteDecimals, 
        marketId: new PublicKey(market_id), 
        programId: MAINNET_PROGRAM_ID.AmmV4, 
        marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET
    });
    const { id: ammId, lpMint } = associatedPoolKeys;
    console.log("AMM ID:", ammId.toString());
    console.log("lpMint:", lpMint.toString());

    // --------------------------------------------
    let quote_amount = quote_Mint_amount * 10 ** quoteDecimals;
    // -------------------------------------- Get balance
    let base_balance: number;
    let quote_balance: number;

    if (baseMint.toString() === "So11111111111111111111111111111111111111112") {
        base_balance = await connection.getBalance(LP_wallet_keypair.publicKey);
        if (!base_balance) return;
        console.log("SOL Balance:", base_balance);
    } else {
        const temp = await getTokenAccountBalance(
            connection, 
            LP_wallet_keypair.publicKey.toString(), 
            baseMint.toString()
        );
        base_balance = temp || 0;
    }

    if (quoteMint.toString() === "So11111111111111111111111111111111111111112") {
        quote_balance = await connection.getBalance(LP_wallet_keypair.publicKey);
        if (!quote_balance) return;
        console.log("SOL Balance:", quote_balance);
        assert(
            quote_amount <= quote_balance, 
            "Sol LP inut is greater than current balance"
        );
    } else {
        const temp = await getTokenAccountBalance(
            connection, 
            LP_wallet_keypair.publicKey.toString(), 
            quoteMint.toString()
        );
        quote_balance = temp || 0;
    }

    let base_amount_input = Math.ceil(base_balance * input_baseMint_tokens_percentage);
    console.log("Input Base:", base_amount_input);

    // step2: init new pool (inject money into the created pool)
    const lp_ix = await build_create_pool_instructions(
        market_id, 
        LP_wallet_keypair, 
        tokenAccountRawInfos_LP, 
        baseMint, 
        baseDecimals, 
        quoteMint, 
        quoteDecimals, 
        delay_pool_open_time, 
        base_amount_input, 
        quote_amount, 
        lookupTableCache
    );
    console.log("-------- pool creation instructions [DONE] ---------\n");

    // -------------------------------------------------
    // ---- Swap info
    const targetPoolInfo = {
        id: associatedPoolKeys.id.toString(), 
        baseMint: associatedPoolKeys.baseMint.toString(), 
        quoteMint: associatedPoolKeys.quoteMint.toString(),
        lpMint: associatedPoolKeys.lpMint.toString(),
        baseDecimals: associatedPoolKeys.baseDecimals,
        quoteDecimals: associatedPoolKeys.quoteDecimals,
        lpDecimals: associatedPoolKeys.lpDecimals,
        version: 4,
        programId: associatedPoolKeys.programId.toString(),
        authority: associatedPoolKeys.authority.toString(),
        openOrders: associatedPoolKeys.openOrders.toString(),
        targetOrders: associatedPoolKeys.targetOrders.toString(),
        baseVault: associatedPoolKeys.baseVault.toString(),
        quoteVault: associatedPoolKeys.quoteVault.toString(),
        withdrawQueue: associatedPoolKeys.withdrawQueue.toString(),
        lpVault: associatedPoolKeys.lpVault.toString(),
        marketVersion: 3,
        marketProgramId: associatedPoolKeys.marketProgramId.toString(),
        marketId: associatedPoolKeys.marketId.toString(),
        marketAuthority: associatedPoolKeys.marketAuthority.toString(),
        marketBaseVault: marketBaseVault.toString(),
        marketQuoteVault: marketQuoteVault.toString(),
        marketBids: marketBids.toString(),
        marketAsks: marketAsks.toString(),
        marketEventQueue: marketEventQueue.toString(),
        lookupTableAccount: PublicKey.default.toString(),
    };
    console.log(targetPoolInfo);

    const poolKeys = jsonInfo2PoolKeys(targetPoolInfo) as LiquidityPoolKeys;
    console.log("\n -------- Now getting swap instructions --------");

    const metadata = await getTokenMetadata(baseMint);
    const TOKEN_TYPE = new Token(TOKEN_PROGRAM_ID, baseMint, baseDecimals, metadata.data.symbol, metadata.data.name);
    
    const inputTokenAmount = new TokenAmount(DEFAULT_TOKEN.WSOL, (swap_sol_amount * (10 ** quoteDecimals)));
    const minAmountOut = new TokenAmount(TOKEN_TYPE, parseBigNumberish(ONE));

    console.log("Swap wsol [Lamports]:", inputTokenAmount.raw);
    console.log("Min Amount Out[Lamports]:", minAmountOut.raw);
  
    console.log();


    const swap_ix = await build_swap_instructions(connection, poolKeys, tokenAccountRawInfos_Swap, swap_wallet_keypair, inputTokenAmount, minAmountOut);
    console.log("-------- swap token instructions [DONE] ---------\n");
    // swap ix end ------------------------------------------------------------
  
    console.log("------------- Bundle & Send ---------");
  
    console.log("Please wait for 30 seconds for bundle to be completely executed by all nearests available leaders!");
  
    let success = await bull_dozer([lp_ix, swap_ix]);
    while (success < 1) {
        success = await bull_dozer([lp_ix, swap_ix]);
    }
    if (success > 0) {
        console.log("------------- Bundle Succeeded ---------");
    } else {
        console.log("------------- Bundle Failed ---------");
    }
}


txCreateAndInitNewPool();
