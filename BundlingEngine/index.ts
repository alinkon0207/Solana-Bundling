
import { 
    SystemProgram, 
    Transaction, 
    VersionedTransaction, 
    PublicKey, 
    Keypair, 
    TransactionMessage, 
} from "@solana/web3.js";

import { 
    connection,
    wallet1_keypair, 
    wallet2_keypair, 
    wallet3_keypair, 
} from "./config";
import { bull_dozer } from "./jito_bundle/send-bundle";
import { payer } from "../SPLTokenDeployer/config";


const transferSolTxn = async (from: PublicKey, to: PublicKey, amount: number, payer: Keypair) => {
    let instructions = [
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount
        })
    ];

    let { blockhash } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
        payerKey: payer.publicKey, 
        recentBlockhash: blockhash, 
        instructions: instructions
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);

    transaction.sign([payer]);

    return transaction;
}

const testBundling = async () => {
    const solTransTx1 = await transferSolTxn(wallet1_keypair.publicKey, wallet2_keypair.publicKey, Number(0.001 * (10 ** 9)), wallet1_keypair);
    const solTransTx2 = await transferSolTxn(wallet2_keypair.publicKey, wallet3_keypair.publicKey, Number(0.0005 * (10 ** 9)), wallet2_keypair);
    
    console.log("------------- Bundle & Send ---------");
    console.log("Please wait for 30 seconds for bundle to be completely executed by all nearests available leaders!");

    let success = await bull_dozer(
        [solTransTx1, solTransTx2]
    );
    while (success < 1) {
        success = await bull_dozer(
            [solTransTx1, solTransTx2]
        );
    }
    if (success > 0) {
        console.log("------------- Bundle Succeeded ---------");
    } else {
        console.log("------------- Bundle Failed ---------");
    }
}


testBundling();
