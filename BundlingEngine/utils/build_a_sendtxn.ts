
import {
    Connection,
    Keypair,
    SendOptions,
    Signer,
    Transaction,
    VersionedTransaction,
    PublicKey
} from '@solana/web3.js';
import {
    MAINNET_PROGRAM_ID, 
    buildSimpleTransaction, 
    InnerSimpleV0Transaction, 
    Liquidity, 
    TokenAccount, 
    CacheLTA, 
    LiquidityPoolKeys, 
    TokenAmount, 
} from '@raydium-io/raydium-sdk';

import {
    addLookupTableInfo,
    connection,
    makeTxVersion,
} from '../config';

import { getComputeBudgetConfig, getComputeBudgetConfigHigh } from "./budget";
import { BN } from "bn.js";


export async function sendTx(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];

    for (const iTx of txs) {
        if (iTx instanceof VersionedTransaction) {
            iTx.sign([payer]);
            txids.push(await connection.sendTransaction(iTx, options));
        } else {
            txids.push(await connection.sendTransaction(iTx, [payer], options));
        }
    }

    return txids;
}


export async function buildAndSendTx(keypair: Keypair, innerSimpleV0Transaction: InnerSimpleV0Transaction[], options?: SendOptions) {
    const willSendTx = await buildSimpleTransaction({
        connection,
        makeTxVersion,
        payer: keypair.publicKey,
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    })

    return await sendTx(connection, keypair, willSendTx, options)
}


export async function build_create_pool_instructions(
    market_id: PublicKey, 
    keypair: Keypair, 
    tokenAccountRawInfos: TokenAccount[], 
    baseMint: PublicKey, 
    baseDecimals: number, 
    quoteMint: PublicKey, 
    quoteDecimals: number, 
    delay_pool_open_time: number, 
    base_amount_input: number, 
    quote_amount: number, 
    lookupTableCache: CacheLTA
) {
    const { innerTransactions } =
        await Liquidity.makeCreatePoolV4InstructionV2Simple({
            connection,
            programId: MAINNET_PROGRAM_ID.AmmV4,
            marketInfo: {
                programId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
                marketId: market_id,
            },
            associatedOnly: false,
            ownerInfo: {
                feePayer: keypair.publicKey,
                wallet: keypair.publicKey,
                tokenAccounts: tokenAccountRawInfos,
                useSOLBalance: true,
            },
            baseMintInfo: {
                mint: baseMint,
                decimals: baseDecimals,
            },
            quoteMintInfo: {
                mint: quoteMint,
                decimals: quoteDecimals,
            },

            startTime: new BN(Math.floor(Date.now() / 1000) + delay_pool_open_time),
            baseAmount: new BN(base_amount_input.toString()),
            quoteAmount: new BN(quote_amount.toString()),

            computeBudgetConfig: await getComputeBudgetConfig(),
            checkCreateATAOwner: true,
            makeTxVersion: makeTxVersion,
            lookupTableCache,
            feeDestinationId: new PublicKey(
                "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"
            ),
        })

    return innerTransactions;
}


export async function build_swap_instructions(
    connection: Connection, 
    poolKeys: LiquidityPoolKeys, 
    tokenAccountRawInfos_Swap: TokenAccount[], 
    keypair: Keypair, 
    inputTokenAmount: TokenAmount, 
    minAmountOut: TokenAmount
) {
    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            tokenAccounts: tokenAccountRawInfos_Swap,
            owner: keypair.publicKey,
        },
        amountIn: inputTokenAmount,
        amountOut: minAmountOut,
        fixedSide: "in",
        makeTxVersion,
        computeBudgetConfig: await getComputeBudgetConfigHigh(),
    })

    return innerTransactions;
}
