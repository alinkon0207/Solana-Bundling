
import { Keypair } from "@solana/web3.js";
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';

import {
    BLOCK_ENGINE_URL, 
    jito_auth_keypair, 
} from '../config';
import {
    build_bundle, 
    onBundleResult
} from './build-bundle';


export async function bull_dozer(txs: any) {
    console.log();
    console.log();
    
    console.log('BLOCK_ENGINE_URL:', BLOCK_ENGINE_URL);

    const bundleTransactionLimit = parseInt('3');
    const search = searcherClient(BLOCK_ENGINE_URL, jito_auth_keypair);

    await build_bundle(
        search, 
        bundleTransactionLimit, 
        txs
    );
    const bundle_result = await onBundleResult(search);

    return bundle_result;
}
