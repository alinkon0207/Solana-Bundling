
import { 
    WALLET
} from "./config";
import { createToken, createPool } from "./create";


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
    );
    if (tokenMint === null) {
        return;
    }

    const ammId = await createPool(tokenMint, DECIMALS, BigInt(TOTAL_SUPPLY * 8 / 10), BigInt(1));
    if (ammId === null) {
        return;
    }
    console.log("  AMM ID:", ammId?.toBase58());
}

main();
