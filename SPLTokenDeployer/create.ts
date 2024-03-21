
import {
    Keypair,
    SystemProgram,
    Transaction,
    PublicKey,
    sendAndConfirmTransaction
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createInitializeMintInstruction,
    mintTo,
    setAuthority,
    AuthorityType,
    getMinimumBalanceForRentExemptMint,
    getOrCreateAssociatedTokenAccount,
    getMint,
} from "@solana/spl-token";
import {
    Metaplex,
    bundlrStorage,
    keypairIdentity,
    toMetaplexFile,
} from "@metaplex-foundation/js";
import {
    DataV2,
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID
} from "@metaplex-foundation/mpl-token-metadata";
import { 
    Market 
} from "@project-serum/serum";
import { 
    Token,
    MarketV2,
    Liquidity, 
    buildSimpleTransaction,
} from "@raydium-io/raydium-sdk";

import {
    isMainNet,
    connection,
    networkUrl,
    payer,
    WALLET,
    makeTxVersion,
    PROGRAMIDS,
    addLookupTableInfo
} from "./config";
import {
    generateExplorerTxUrl,
    sleep,
    mySendAndConfirmTransaction,
    myBuildSendAndConfirmTxs,
    getWalletTokenAccounts, 
    mySendAndConfirmTxs
} from "./utils";

import * as fs from "fs";
import BN from "bn.js";


const BUNDLR_URL = isMainNet ? "https://node1.bundlr.network" : "https://devnet.bundlr.network";


const myCreateMint = async (
        mintAuthority: PublicKey, 
        freezeAuthority: any, 
        decimals: number
): Promise<any> => {
    const keypair = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    
    const transaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: keypair.publicKey,
            space: MINT_SIZE,
            lamports,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
            keypair.publicKey,
            decimals,
            mintAuthority,
            freezeAuthority,
            TOKEN_PROGRAM_ID
        )
    );

    const newTokenTx = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, keypair]
    );
    if (newTokenTx === "") {
        console.error("  Failed to create a new token:");
        return null;
    }
    
    console.log("  New token created:", generateExplorerTxUrl(newTokenTx));
    return keypair.publicKey;
}


const createMetadata = async(mint: PublicKey, name: string, symbol: string, imgName: string, description: string, mintAuthority: PublicKey, updateAuthority: PublicKey) => {
    console.log(`Creating metadata with mint: ${mint}`);

    const metaplex = Metaplex.make(connection)
        .use(keypairIdentity(WALLET))
        .use(
            bundlrStorage({
                address: BUNDLR_URL,
                providerUrl: networkUrl,
                timeout: 60000
            })
        );
    
    const [metadataPDA] = await PublicKey.findProgramAddress(
        [
            Buffer.from("metadata"),
            PROGRAM_ID.toBuffer(),
            mint.toBuffer()
        ],
        PROGRAM_ID
    );
    console.log(`  Got metadataAccount address: ${metadataPDA}`);

    // read file to buffer
    const buffer = fs.readFileSync(`assets/${imgName}`);
    // buffer to metaplex file
    const file = toMetaplexFile(buffer, imgName);

    // upload image and get image uri
    const imageUri = await metaplex.storage().upload(file);
    console.log("  imageUri:", imageUri);

    // upload metadata and get metadata uri (off chain metadata)
    const { uri } = await metaplex.nfts().uploadMetadata({
        name: name,
        symbol: symbol,
        description: description,
        image: imageUri,
    });
    console.log("  metadataUri:", uri);

    // onchain metadata format
    const tokenMetadata = {
        name: name,
        symbol: symbol,
        uri: uri,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null
    } as DataV2;

    // transaction to create metadata account
    const transaction = new Transaction().add(
        createCreateMetadataAccountV3Instruction(
            {
                metadata: metadataPDA,
                mint: mint,
                mintAuthority: mintAuthority,
                payer: payer.publicKey,
                updateAuthority: updateAuthority,
            },
            {
                createMetadataAccountArgsV3: {
                    data: tokenMetadata,
                    isMutable: true,
                    collectionDetails: null
                }
            }
        )
    );

    // send transaction
    const metadataSig = await mySendAndConfirmTransaction(connection, payer, transaction);
    if (metadataSig === "") {
        console.error("  Failed to create metadata");
        return false;
    }

    console.log("  Token metadata uploaded:", generateExplorerTxUrl(metadataSig));
    return true;
}


const mintToken = async (mint: PublicKey, mintAuthority: any, mintAmount: bigint, decimals: number) => {
    console.log(`Minting tokens with mint: ${mint} amount: ${mintAmount}`);

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        WALLET.publicKey
    );
    const tokenAmount = mintAmount * BigInt(10 ** decimals);
    const mintSig = await mintTo(
        connection,
        payer,
        mint,
        tokenAccount.address,
        mintAuthority,
        tokenAmount
    );
    if (mintSig === "") {
        console.error("  Failed to mint tokens");
        return false;
    }

    console.log("  Tokens minted:", generateExplorerTxUrl(mintSig));
    return true;
}


const createOpenBookMarket = async (mint: PublicKey, decimals: number, minOrderSize: number, tickSize: number) => {
    console.log(`Creating OpenBook market with mint: ${mint}`);

    const baseToken = new Token(TOKEN_PROGRAM_ID, mint, decimals);
    const quoteToken = Token.WSOL;

    const { innerTransactions, address } = await MarketV2.makeCreateMarketInstructionSimple({
        connection,
        wallet: WALLET.publicKey,
        baseInfo: baseToken,
        quoteInfo: quoteToken,
        lotSize: minOrderSize,    // default: 1
        tickSize: tickSize, // default: 0.01
        dexProgramId: PROGRAMIDS.OPENBOOK_MARKET,
        makeTxVersion
    });

    const createSigs = await myBuildSendAndConfirmTxs(innerTransactions);
    if (createSigs.length === 0) {
        console.error("  Failed to create OpenBook market");
        return null;
    }

    console.log('  Created OpenBook market:', createSigs);
    return address.marketId;
};


export const createToken = async (
    name: string, 
    symbol: string, 
    decimals: number, 
    totalSupply: number, 
    imgName: string,
    description: string,
    mintAuthority: PublicKey,
    updateAuthority: PublicKey,
) => {
    console.log(`Creating new token with name: ${name}, symbol: ${symbol}, decimals: ${decimals}, totalSupply: ${totalSupply}`);

    /* Step 1 - Create a new token */
    const mint: PublicKey = await myCreateMint(mintAuthority, null, decimals);
    if (mint === null) {
        return null;
    }
    console.log("  Mint address:", mint.toBase58());
    await sleep(3000);

    /* Step 2 - Create metadata */
    const created = await createMetadata(mint, name, symbol, imgName, description, mintAuthority, updateAuthority);
    if (!created) {
        return null;
    }

    /* Step 3 - Mint tokens to owner */
    const minted = await mintToken(mint, mintAuthority, BigInt(totalSupply), decimals);
    if (!minted) {
        return null;
    }
    await sleep(3000);

    /* Step 4 - Create OpenBook market */
    try {
        const marketId = await createOpenBookMarket(mint, decimals, 1, 0.000001);
        if (!marketId) {
            return null;
        }
        console.log("  Market ID:", marketId.toBase58());
    } catch (err) {
        console.error("  Failed to create OpenBook market, error:", err);
        return null;
    }

    /* Last Step - Revoke mint authority */
    console.log("Disabling mint authority with mint:", mint.toBase58());
    const disableMintSig = await setAuthority(
        connection,
        payer,
        mint,
        mintAuthority,
        AuthorityType.MintTokens,
        null
    );
    if (disableMintSig === "") {
        console.error("  Failed to revoke mint authority");
        return null;
    }

    console.log("  Mint function disabled:", generateExplorerTxUrl(disableMintSig));
    return mint;
}


export const createPool = async(baseMint: PublicKey, baseTokenAmount: bigint, solAmount: bigint) => {
    console.log(`Creating pool with baseMint: ${baseMint} baseTokenAmount: ${baseTokenAmount} solAmount: ${solAmount}`);

    const baseMintInfo = await getMint(connection, baseMint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, baseMint, baseMintInfo.decimals);
    const quoteToken = Token.WSOL;

    const accounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (accounts.length === 0) {
        console.error("  Failed to find OpenBook market");
        return null;
    }
    const marketId = accounts[0].publicKey;

    const startTime = Math.floor(Date.now() / 1000);
    const baseAmount = baseTokenAmount * BigInt(10 ** baseToken.decimals);
    const quoteAmount = solAmount * BigInt(10 ** quoteToken.decimals);
    const walletTokenAccounts = await getWalletTokenAccounts(connection, WALLET.publicKey);

    const { innerTransactions, address } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: PROGRAMIDS.AmmV4,
        marketInfo: {
            marketId: marketId,
            programId: PROGRAMIDS.OPENBOOK_MARKET,
        },
        baseMintInfo: baseToken,
        quoteMintInfo: quoteToken,
        baseAmount: new BN(baseAmount.toString()),
        quoteAmount: new BN(quoteAmount.toString()),
        startTime: new BN(startTime),
        ownerInfo: {
            feePayer: payer.publicKey,
            wallet: WALLET.publicKey,
            tokenAccounts: walletTokenAccounts,
            useSOLBalance: true,
        },
        associatedOnly: false,
        checkCreateATAOwner: true,
        makeTxVersion: makeTxVersion,
        feeDestinationId: 
            new PublicKey(isMainNet ? "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5" : "3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR")
    });

    const willSendTx = await buildSimpleTransaction({
        makeTxVersion,
        payer: payer.publicKey,
        connection,
        innerTransactions: innerTransactions,
        addLookupTableInfo: addLookupTableInfo,
    });
    // console.log("  willSendTx:", willSendTx)

    const createPoolSigs = await mySendAndConfirmTxs(connection, WALLET, willSendTx);
    if (createPoolSigs.length === 0) {
        console.error("  Failed to create pool");
        return null;
    }
    console.log("  createPoolSigs:", createPoolSigs);

    return address.ammId;
}
