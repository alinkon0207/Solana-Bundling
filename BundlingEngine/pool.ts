
import { 
    PublicKey, 
    Keypair, 
    VersionedTransaction
} from "@solana/web3.js";
import { 
    getMint
} from "@solana/spl-token";
import { 
    Market 
} from "@project-serum/serum";
import {
    Liquidity, 
    MAINNET_PROGRAM_ID, 
    MARKET_STATE_LAYOUT_V3, LiquidityPoolKeys, 
    Token, TokenAmount, 
    TOKEN_PROGRAM_ID, 
    buildSimpleTransaction, 
    Percent, 
} from "@raydium-io/raydium-sdk";
import * as bs58 from "bs58";
import BN from "bn.js";

import {
    connection, 
    makeTxVersion, 
    addLookupTableInfo
} from "./config";
import {
    getWalletTokenAccounts
} from "./utils";
import { bull_dozer } from "./jito_bundle/send-bundle";


export const createPool = async(baseMint: PublicKey, baseTokenAmount: bigint, quoteMintAmount: bigint, payer: Keypair) => {
    console.log(`Creating pool with baseMint: ${baseMint} baseTokenAmount: ${baseTokenAmount} quoteMintamount: ${quoteMintAmount}`);

    const baseMintInfo = await getMint(connection, baseMint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, baseMint, baseMintInfo.decimals);
    const quoteToken = Token.WSOL;

    const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, MAINNET_PROGRAM_ID.OPENBOOK_MARKET);
    if (accounts.length === 0) {
        console.error("  Failed to find OpenBook market");
        return null;
    }
    const marketId = accounts[0].publicKey;

    const startTime = Math.floor(Date.now() / 1000);
    const baseAmount = baseTokenAmount * BigInt(10 ** baseToken.decimals);
    const quoteAmount = quoteMintAmount * BigInt(10 ** quoteToken.decimals);
    const walletTokenAccounts = await getWalletTokenAccounts(connection, payer.publicKey);

    const { innerTransactions, address } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: MAINNET_PROGRAM_ID.AmmV4,
        marketInfo: {
            marketId: marketId,
            programId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
        },
        baseMintInfo: baseToken,
        quoteMintInfo: quoteToken,
        baseAmount: new BN(baseAmount.toString()),
        quoteAmount: new BN(quoteAmount.toString()),
        startTime: new BN(startTime),
        ownerInfo: {
            feePayer: payer.publicKey,
            wallet: payer.publicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true,
        },
        associatedOnly: false,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        feeDestinationId: new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5")
    });

    const willSendTx = await buildSimpleTransaction({
        makeTxVersion,
        payer: payer.publicKey,
        connection,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });
    // console.log("  willSendTx:", willSendTx)

    if (willSendTx[0] instanceof VersionedTransaction) {
        willSendTx[0].sign([payer]);
    }

    return willSendTx[0];
}


export const swap = async (inputTokenAmount: TokenAmount, outputToken: Token, isBuy: boolean, buyerOrSeller: Keypair) => {
    console.log(`Swapping tokens with inputToken: ${inputTokenAmount.token.mint} inputTokenAmount: ${inputTokenAmount.raw}`);

    const baseToken = isBuy ? outputToken : inputTokenAmount.token;
    const quoteToken = isBuy ? inputTokenAmount.token : outputToken;
    const walletTokenAccounts = await getWalletTokenAccounts(connection, buyerOrSeller.publicKey);

    const slippage = new Percent(1, 100);

    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, MAINNET_PROGRAM_ID.OPENBOOK_MARKET);
    console.log("  marketId:", marketId);
    // console.log("  accountInfo:", accountInfo);
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(accountInfo.data);
    let poolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint: baseToken.mint,
        quoteMint: quoteToken.mint,
        baseDecimals: baseToken.decimals,
        quoteDecimals: quoteToken.decimals,
        marketId: marketId,
        programId: MAINNET_PROGRAM_ID.AmmV4,
        marketProgramId: MAINNET_PROGRAM_ID.OPENBOOK_MARKET,
    });
    // console.log("  poolKeys:", poolKeys);

    let poolKeys2: LiquidityPoolKeys = {
        id: poolKeys.id,
        baseMint: poolKeys.baseMint,
        quoteMint: poolKeys.quoteMint,
        lpMint: poolKeys.lpMint,
        baseDecimals: poolKeys.baseDecimals,
        quoteDecimals: poolKeys.quoteDecimals,
        lpDecimals: poolKeys.lpDecimals,
        version: poolKeys.version,
        programId: poolKeys.programId,
        authority: poolKeys.authority,
        openOrders: poolKeys.openOrders,
        targetOrders: poolKeys.targetOrders,
        baseVault: poolKeys.baseVault,
        quoteVault: poolKeys.quoteVault,
        withdrawQueue: poolKeys.withdrawQueue,
        lpVault: poolKeys.lpVault,
        marketVersion: poolKeys.marketVersion,
        marketProgramId: poolKeys.marketProgramId,
        marketId: poolKeys.marketId,
        marketAuthority: poolKeys.marketAuthority,
        marketBaseVault: marketInfo.baseVault,
        marketQuoteVault: marketInfo.quoteVault,
        marketBids: marketInfo.bids,
        marketAsks: marketInfo.asks,
        marketEventQueue: marketInfo.eventQueue,
        lookupTableAccount: poolKeys.lookupTableAccount
    };
    // console.log("  poolKeys2:", poolKeys2);

    // -------- step 1: compute amount out --------
    const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
        poolKeys: poolKeys2,
        poolInfo: await Liquidity.fetchInfo({ connection, poolKeys: poolKeys2 }),
        amountIn: inputTokenAmount,
        currencyOut: outputToken,
        slippage: slippage,
    });
    console.log('  amountOut:', amountOut.toFixed(), '  minAmountOut:', minAmountOut.toFixed());

    // -------- step 2: create instructions by SDK function --------
    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys: poolKeys2,
        userKeys: {
            tokenAccounts: walletTokenAccounts,
            owner: buyerOrSeller.publicKey,
        },
        amountIn: inputTokenAmount,
        amountOut: minAmountOut,
        fixedSide: 'in',
        makeTxVersion,
    });

    const willSendTx = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: buyerOrSeller.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });

    if (willSendTx[0] instanceof VersionedTransaction) {
        willSendTx[0].sign([buyerOrSeller]);
    }

    return willSendTx[0];
}


async function txCreateAndInitNewPool() {
    const TOKEN_MINT = "B2zf13551iebnW6xBPPMvqX9hvQygGzYorUBYFHCEN7a"; // Must be the mint of token deployed on Mainnet
    const tokenMint = new PublicKey(TOKEN_MINT);
    const TOTAL_SUPPLY = 100_000_000;
    const DECIMALS = 6;

    const LP_WALLET_KEYPAIR = process.env.LP_WALLET_KEYPAIR || "";
    const LP_wallet_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(LP_WALLET_KEYPAIR)));

    const lp_ix = await createPool(tokenMint, BigInt(TOTAL_SUPPLY * 0.8), BigInt(1), LP_wallet_keypair);
    console.log("-------- pool creation instructions [DONE] ---------\n");

    
    const SWAP_WALLET_KEYPAIR = process.env.SWAP_WALLET_KEYPAIR || "";
    const swap_wallet_keypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(SWAP_WALLET_KEYPAIR)));

    const inputTokenAmount = new TokenAmount(Token.WSOL, BigInt(0.1 * (10 ** 9)));  // Buy tokens with 0.1 SOL
    const outputToken = new Token(TOKEN_PROGRAM_ID, tokenMint, DECIMALS);

    const swap_ix = await swap(inputTokenAmount, outputToken, /* isBuy */ true, swap_wallet_keypair);
    console.log("-------- swap token instructions [DONE] ---------\n");
  
    
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
