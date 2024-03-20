
import {
    Connection, 
    Keypair, 
    PublicKey, 
    VersionedTransaction, 
} from "@solana/web3.js";
import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types";
import { isError } from "jito-ts/dist/sdk/block-engine/utils";
import { buildSimpleTransaction } from "@raydium-io/raydium-sdk";

import {
    jito_auth_keypair, 
    wallet_2_pay_jito_fees_keypair, 
    connection, 
    addLookupTableInfo, 
    makeTxVersion
} from "../config";


export async function build_bundle(
    search: SearcherClient, 
    bundleTransactionLimit: number, 
    txns: any
) {
    if (txns.length > bundleTransactionLimit) {
        console.error("Exceeded bundleTransactionLimit");
        return false;
    }
    
    const _tipAccount = (await search.getTipAccounts())[0];
    console.log("tip account:", _tipAccount);
    const tipAccount = new PublicKey(_tipAccount);

    const bund = new Bundle([], bundleTransactionLimit);
    const resp = await connection.getLatestBlockhash("finalized");

    for (let i = 0; i < txns.length; i++) {
        bund.addTransactions(txns[i]);
    }

    let maybeBundle = bund.addTipTx(
        wallet_2_pay_jito_fees_keypair, 
        /* 1000000 */ /* 500000 */ /* 300000 */ /* 200000 */ /* 100000 */ /* 50000 */ /* 10000 */  5000  /* 1000 */, 
        tipAccount, 
        resp.blockhash
    );

    if (isError(maybeBundle)) {
        throw maybeBundle;
    }
    console.log();

    try {
        const response_bund = await search.sendBundle(maybeBundle);
        console.log("response_bund:", response_bund);
    } catch (err) {
        console.error("error sending bundle:", err);
    }

    return maybeBundle;
}


export async function onBundleResult(c: SearcherClient): Promise<number> {
    let first = 0;
    let isResolved = false;

    return new Promise((resolve) => {
        // Set a timeout to reject the promise if no bundle is accepted within 5 seconds
        setTimeout(() => {
            resolve(first);
            isResolved = true;
        }, 30000);

        c.onBundleResult(
            (result) => {
                if (isResolved) return first;
                // clearTimeout(timeout); // Clear the timeout if a bundle is accepted

                const isAccepted = result.accepted;
                const isRejected = result.rejected;
                
                if (isResolved === false) {
                    if (isAccepted) {
                        console.log(
                            "bundle accepted, ID:", 
                            result.bundleId, 
                            " Slot: ", 
                            result.accepted?.slot
                        );

                        first += 1;
                        isResolved = true;
                        resolve(first); // Resolve with 'first' when a bundle is accepted
                    }

                    if (isRejected) {
                        console.log("bundle rejected:", result);
                        // Do not resolve or reject the promise here
                    }
                }
            },
            (err) => {
                console.error(err);
                // Do not reject the promise here
            }
        );
    });
}
