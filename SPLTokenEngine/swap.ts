
import { 
    Market, 
    MARKET_STATE_LAYOUT_V3 
} from "@project-serum/serum";
import { 
    Token, 
    TokenAmount, 
    Percent, 
    Liquidity, 
    buildSimpleTransaction,
    LiquidityPoolKeys
} from "@raydium-io/raydium-sdk";

import {
    connection, 
    buyerOrSeller, 
    payer, 
    PROGRAMIDS, 
    makeTxVersion,
    addLookupTableInfo
} from "./config";
import {
    getWalletTokenAccounts,
    mySendAndConfirmTxs
} from "./utils";


export const swap = async (inputTokenAmount: TokenAmount, outputToken: Token, isBuy: boolean) => {
    const baseToken = isBuy ? outputToken : inputTokenAmount.token;
    const quoteToken = isBuy ? inputTokenAmount.token : outputToken;
    const walletTokenAccounts = await getWalletTokenAccounts(connection, buyerOrSeller.publicKey);

    const slippage = new Percent(1, 100);

    const [{ publicKey: marketId, accountInfo }] = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
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
        programId: PROGRAMIDS.AmmV4,
        marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
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

    const transactions = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: makeTxVersion,
        payer: payer.publicKey,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });

    const txids = await mySendAndConfirmTxs(connection, payer, transactions);
    console.log('  swapped txns:', txids);
    return txids;
}
