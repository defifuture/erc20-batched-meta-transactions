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

        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountOne]);

        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountOne);
        let sigSlices = sliceSignature(signature);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
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

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx receiver
        let accountFour = accounts[3];  // sign with this address instead of the sender's address (invalid sig)

        // before start: send 50 tokens to accountTwo (so that it has enough balance to be able to send a meta tx)
        let tokenTransfer = await instance.transfer(accountTwo, 50);

        // meta tx data
        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        let newNonce = parseInt(lastNonce) + 1;

        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee, the nonce and the token contract address
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountOne]);
        
        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountFour); // signed with a WRONG address
        let sigSlices = sliceSignature(signature);

        // Account 1 (relayer) should have 9999950 tokens (10 million - 50 tokens sent to account 2 before the start)
        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender) should have 50 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver) should have 0 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // Account 4 (invalid signature) should have 0 tokens
        let balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);

        // RESULT: The meta tx should have been skipped, so the balances should've stayed the same

        // Account 1 (relayer) - The relayer gets nothing because it should've validated the meta tx sig before sending it on-chain
        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver)
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // Account 4 (invalid signature)
        balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);
    });

    it("should skip if receiver address is 0x0", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = "0x0000000000000000000000000000000000000000";  // meta tx receiver
        
        // meta tx data
        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        let newNonce = parseInt(lastNonce) + 1;

        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee, the nonce and the token contract address
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountOne]);
        
        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountTwo);
        let sigSlices = sliceSignature(signature);

        // Account 1 (relayer) should have 9999950 tokens (10 million - 50 tokens sent to account 2 before the start)
        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender) should have 50 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver) should have 0 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);

        // RESULT: The meta tx should have been skipped, so the balances should've stayed the same

        // Account 1 (relayer) - The relayer gets nothing because it should've validated the meta tx sig before sending it on-chain
        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver)
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);
    });

    it("should skip if meta tx was processed too late (due block number too low)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx receiver

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        let newNonce = parseInt(lastNonce) + 1;

        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber - 1;  // block number TOO LOW (in the past - this should skip the meta tx)

        // create a hash
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountOne]);
        
        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountTwo);
        let sigSlices = sliceSignature(signature);

        // Account 1 (relayer) should have 9999950 tokens (10 million - 50 tokens sent to account 2 before the start)
        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (receiver) should have 50 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (relayer) should have 0 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);

        // RESULT: The meta tx should have been skipped, so the balances should've stayed the same

        // Account 1 (relayer) - The relayer gets nothing because it should've validated the meta tx sig before sending it on-chain
        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver)
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);
    });

    it("should skip if a malicious relayer stole a meta tx from some other relayer (front-running attack)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // malicious relayer (front-runner)
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx receiver
        let accountFour = accounts[3];  // intended relayer

        // prepare meta tx data (accountTwo sending tokens to accountThree)
        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountTwo);
        let newNonce = parseInt(lastNonce) + 1;

        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee, the nonce and the token contract address
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountFour]); // Note that the intended relayer's address is added here (accountFour)
        
        let hash = web3.utils.keccak256(valuesEncoded);

        // create a signature
        let signature = await web3.eth.sign(hash, accountTwo);
        let sigSlices = sliceSignature(signature);

        // Account 1 (attacker) should have 9999950 tokens (10 million - 50 tokens sent to account 2 before the start)
        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender) should still have 50 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver) should have 0 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // Account 4 (intended relayer) should have 0 tokens
        let balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);

        // send meta batch tx (sent by the malicious relayer - accountOne)
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);
        // console.log(result);

        // RESULT: The meta tx should have been skipped, so the balances should've stayed the same

        // Account 1 (attacker)
        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 9999950);

        // Account 2 (sender)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // Account 3 (receiver)
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 0);

        // Account 3 (receiver)
        balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);
    });

});
