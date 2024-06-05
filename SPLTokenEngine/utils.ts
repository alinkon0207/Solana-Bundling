
import {
    Connection,
    Keypair,
    PublicKey,
    VersionedTransaction,
    SendOptions,
    Signer,
    Transaction,
    ConfirmOptions,
} from '@solana/web3.js';

import {
    buildSimpleTransaction,
    InnerSimpleV0Transaction,
    TOKEN_PROGRAM_ID,
    SPL_ACCOUNT_LAYOUT
} from '@raydium-io/raydium-sdk';

import {
    isMainNet,
    connection,
    WALLET,
    payer,
    makeTxVersion,
    addLookupTableInfo,
} from './config';


const SOLSCAN_CLUSTER = isMainNet ? "" : "?cluster=devnet";


// Helper function to generate Explorer URL
export function generateExplorerTxUrl(txId: string) {
    return `https://solscan.io/tx/${txId}${SOLSCAN_CLUSTER}`;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


export async function getWalletTokenAccounts(connection: Connection, wallet: PublicKey) {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
};


// async function mySendTransaction(connection: Connection, 
//         iTx: VersionedTransaction | Transaction, 
//         payer: (Keypair | Signer)[], 
//         options?: SendOptions): Promise<string> {
//     let signatures: string[]= [];
//     const maxRetries = 50;

//     for (let retries = 0; retries < maxRetries; retries++) {
//         console.log("  retries:", retries);

//         const latest = await connection.getLatestBlockhash();
//         let blockHeight = 0;

//         if (iTx instanceof VersionedTransaction) {
//             iTx.sign(payer);
//         } else {
//             iTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//             iTx.sign(...payer);
//         }

//         const rawTx = iTx.serialize();
//         do {
//             let signature = "";

//             // if (iTx instanceof VersionedTransaction) {
//             //     signature = await connection.sendTransaction(iTx, options);
//             //     signatures.push(signature);
//             // } else {
//             //     signature = await connection.sendTransaction(iTx, payer, options);
//             //     signatures.push(signature);
//             // }
//             signature = await connection.sendRawTransaction(rawTx, options);
//             signatures.push(signature);
//             await sleep(500);

//             for (let i = 0; i < signatures.length; i++) {
//                 signature = signatures[i];
//                 // const stat = await connection.getSignatureStatus(signature);
//                 // if (stat.value?.confirmationStatus === "processed" 
//                 //         || stat.value?.confirmationStatus === "confirmed" 
//                 //         || stat.value?.confirmationStatus === "finalized") {
//                 //     console.log("    transaction processed/confirmed/finalized");
//                 //     return signature;
//                 // }
//                 const ret = await connection.getParsedTransaction(signature, {
//                     maxSupportedTransactionVersion: 0,
//                 });
//                 if (ret)
//                     return signature;
//             }
            
//             blockHeight = await connection.getBlockHeight();
//             // console.log(`  (retries:${retries})  blockHeight: ${blockHeight}`);
//         } while (blockHeight < latest.lastValidBlockHeight);
//     }

//     console.error("  Failed to send transaction");
//     return "";
// }


export const mySendTransaction = async (
    connection: Connection, 
    transaction: VersionedTransaction | Transaction, 
    signers: (Signer | Keypair)[], 
    options?: SendOptions
) => {
    let retries = 50;

    if (transaction instanceof Transaction) {
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        if (signers.length > 0)
            transaction.sign(...signers);
    } else {
        if (signers.length > 0)
            transaction.sign(signers);
    }

    const rawTransaction = transaction.serialize();
    while (retries > 0) {
        try {
            const signature = await connection.sendRawTransaction(rawTransaction, {
                maxRetries: 0,
            });

            const sentTime = Date.now();
            while (Date.now() - sentTime <= 1000) {
                const ret = await connection.getParsedTransaction(signature, {
                    maxSupportedTransactionVersion: 0,
                });
                if (ret)
                    return signature;

                await sleep(500);
            }
        } catch (err) {
            console.error("sendTransaction error:", err);
        }
        retries--;
    }

    return "";
}


export async function mySendAndConfirmTransaction(
    connection: Connection, 
    payer: Keypair | Signer, 
    transaction: VersionedTransaction | Transaction, 
    options?: ConfirmOptions
): Promise<string> {
    const signature = await mySendTransaction(connection, transaction, [payer], options);
    await connection.confirmTransaction(signature);
    return signature;
}


export async function mySendAndConfirmTxs(
    connection: Connection,
    payer: Keypair | Signer,
    txs: (VersionedTransaction | Transaction)[],
    options?: SendOptions
): Promise<string[]> {
    const txids: string[] = [];

    for (const iTx of txs) {
        const signature = await mySendAndConfirmTransaction(connection, payer, iTx, options);
        if (signature === "") {
            break;
        }
        txids.push(signature);
    }
    
    return txids;
}


export async function myBuildSendAndConfirmTxs(
    innerSimpleV0Transaction: InnerSimpleV0Transaction[], 
    options?: SendOptions) 
{
    const willSendTx = await buildSimpleTransaction({
        makeTxVersion,
        payer: payer.publicKey,
        connection,
        innerTransactions: innerSimpleV0Transaction,
        addLookupTableInfo: addLookupTableInfo,
    });
    // console.log("  willSendTx:", willSendTx)
    return await mySendAndConfirmTxs(connection, WALLET, willSendTx, options);
}
