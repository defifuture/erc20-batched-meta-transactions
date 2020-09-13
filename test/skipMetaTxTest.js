const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

function sliceSignature(signature) {
    let r = signature.slice(0, 66);
    let s = "0x" + signature.slice(66, 130);
    let v = "0x" + signature.slice(130, 132);
    v = web3.utils.toDecimal(v);
    v = v + 27;

    return {r, s, v};
}

contract("Skipped Meta Transactions", async accounts => {

    it("should skip meta tx if the transfer amount is bigger than the sender's token balance", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender (not enough balance - 0 tokens)
        let accountThree = accounts[2];  // meta tx receiver

        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 0);

        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        let newNonce = parseInt(lastNonce) + 1

        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, instance.address]);

        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountOne);
        let sigSlices = sliceSignature(signature);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [newNonce],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);

        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 0);

        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

    });

    it("should skip if signature is invalid", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // meta tx sender
        let accountTwo = accounts[1];  // meta tx receiver
        let accountThree = accounts[2];  // relayer
        let accountFour = accounts[3];  // sign with this address instead of the sender's address (invalid sig)

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        //console.log(parseInt(lastNonce));

        let newNonce = parseInt(lastNonce) + 1;
        //console.log(newNonce);

        // create a hash of both addresses, the token amount, the fee, the nonce and the token contract address
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'address'], 
                                                          [accountOne, accountTwo, amount, relayerFee, newNonce, instance.address]);
        //console.log("Values encoded: " + valuesEncoded);
        let hash = web3.utils.keccak256(valuesEncoded);
        // console.log("Hash: " + hash);

        // create a signature
        let signature = await web3.eth.sign(hash, accountFour); // signed with a WRONG address
        let sigSlices = sliceSignature(signature);

        // Make sure the first account (sender) has 10 million tokens (received at the smart contract creation)
        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        // Account 2 (receiver) should have 0 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 0);

        // Account 3 (relayer) should have 0 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountOne],
                                                     [accountTwo],
                                                     [amount],
                                                     [relayerFee],
                                                     [newNonce],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);
        // console.log(result);

        // RESULT: The meta tx should have been skipped, so the balances should've stayed the same

        // Account 1 (sender)
        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        // Account 2 (receiver)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 0);

        // Account 3 (relayer) - The relayer gets nothing because it should've validated the meta tx sig before sending it on-chain
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);
    });

});
