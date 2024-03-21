
import { PublicKey } from "@solana/web3.js";
import {
    Token, 
    TokenAmount, 
    TOKEN_PROGRAM_ID
} from "@raydium-io/raydium-sdk";
import * as readline from "readline";

import { WALLET } from "./config";
import { createToken, createPool } from "./create";
import { swap } from "./swap";
import { sleep } from "./utils";


let userInput = "";

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});


const main = async () => {
    const TOKEN_NAME = 'MyTestToken';
    const TOKEN_SYMBOL = 'MTT';
    const DECIMALS = 6;
    const TOTAL_SUPPLY = 100000000;
    const TOKEN_IMG_NAME = 'test.png';
    const TOKEN_DESCRIPTION = 'My Test Token on Solana';

    const tokenMint = await createToken(
        TOKEN_NAME, 
        TOKEN_SYMBOL,
        DECIMALS,
        TOTAL_SUPPLY,
        TOKEN_IMG_NAME,
        TOKEN_DESCRIPTION,
        WALLET.publicKey,
        WALLET.publicKey
    )  /* new PublicKey("B2zf13551iebnW6xBPPMvqX9hvQygGzYorUBYFHCEN7a") */;
    if (tokenMint === null) {
        return;
    }

    const ammId = await createPool(tokenMint, BigInt(TOTAL_SUPPLY * 8 / 10), BigInt(1));
    if (ammId === null) {
        return;
    }
    console.log("  AMM ID:", ammId?.toBase58());

    console.log();
    console.log();


    // Listen for user input
    rl.on("line", (input) => {
        userInput = input;
    });

    while (true) {
        try {
            if (userInput === "stop") {
                process.exit(0);
            } else if (userInput === "buy") {
                console.log("buying tokens...");
                const inputTokenAmount = new TokenAmount(Token.WSOL, BigInt(0.1 * (10 ** 9)));
                const outputToken = new Token(TOKEN_PROGRAM_ID, tokenMint, DECIMALS);
                await swap(inputTokenAmount, outputToken, true);
            } else if (userInput === "sell") {
                console.log("selling tokens...");
                const inputTokenAmount = new TokenAmount(new Token(TOKEN_PROGRAM_ID, tokenMint, DECIMALS), BigInt(1000000 * (10 ** DECIMALS)));
                const outputToken = Token.WSOL;
                await swap(inputTokenAmount, outputToken, false);
            }
        } catch (err) {
        }

        await sleep(3000);
    }
}

main();
