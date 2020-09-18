const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

function sliceSignature(signature) {
    let r = signature.slice(0, 66);
    let s = "0x" + signature.slice(66, 130);
    let v = "0x" + signature.slice(130, 132);
    v = web3.utils.toDecimal(v);
    v = v + 27;

    return {r, s, v};
}

contract("Failed Meta Transactions", async accounts => {

    it("should fail if meta tx is missing some data (data = null)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx sender
        let accountFour = accounts[3];  // token receiver
        let accountFive = accounts[4];  // token receiver

        // before start: send 50 tokens to accountTwo & accountThree (so that they has enough balance to be able to send a meta tx)
        let tokenTransfer1 = await instance.transfer(accountTwo, 50);
        let tokenTransfer2 = await instance.transfer(accountThree, 50);

        // START META TX 1 (accountTwo --> accountFour)
        let amount1 = 8;
        let relayerFee1 = 1;

        let lastNonceAccountTwo = await instance.nonceOf(accountTwo);
        let newNonceAccountTwo = parseInt(lastNonceAccountTwo) + 1;

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded1 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountTwo, accountFour, amount1, relayerFee1, newNonceAccountTwo, dueBlockNumber, instance.address, accountOne]);
        
        let hash1 = web3.utils.keccak256(valuesEncoded1);

        // create a signature
        let signature = await web3.eth.sign(hash1, accountTwo);
        let sigSlices = sliceSignature(signature);

        let meta_tx_one = {
            sender: accountTwo,
            receiver: accountFour,
            amount: amount1,
            relayerFee: relayerFee1,
            dueBlock: dueBlockNumber,
            v: sigSlices.v,
            r: sigSlices.r,
            s: sigSlices.s
        }

        // Make sure the second account has 50 tokens
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);
        // END META TX 1

        // START META TX 2 (accountThree --> accountFive)
        let amount2 = 3;
        let relayerFee2 = 1;

        let lastNonceAccountThree = await instance.nonceOf(accountThree);
        let newNonceAccountThree = parseInt(lastNonceAccountThree) + 1;

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded2 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountThree, accountFive, amount2, relayerFee2, newNonceAccountThree, dueBlockNumber, instance.address, accountOne]);
        
        let hash2 = web3.utils.keccak256(valuesEncoded2);

        // create a signature
        let signature2 = await web3.eth.sign(hash2, accountThree);
        let sigSlices2 = sliceSignature(signature2);

        let meta_tx_two = {
            sender: accountThree,
            receiver: accountFive,
            amount: null, // missing data
            relayerFee: relayerFee2,
            dueBlock: dueBlockNumber,
            v: null, // missing data
            r: sigSlices2.r,
            s: sigSlices2.s
        }

        // Make sure the third account has 50 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 50);
        // END META TX 2

        // SEND META TXS BATCH (should fail)
        try {
            let result = await instance.processMetaBatch([meta_tx_one.sender, meta_tx_two.sender],
                                                        [meta_tx_one.receiver, meta_tx_two.receiver],
                                                        [meta_tx_one.amount, meta_tx_two.amount],
                                                        [meta_tx_one.relayerFee, meta_tx_two.relayerFee],
                                                        [meta_tx_one.dueBlock, meta_tx_two.dueBlock],
                                                        [meta_tx_one.v, meta_tx_two.v],
                                                        [meta_tx_one.r, meta_tx_two.r],
                                                        [meta_tx_one.s, meta_tx_two.s]);
        } catch (error) {
            const REVERT = 'invalid number value (arg="amounts", coderType="uint256", value=null)';
            assert(error, "Expected an error but did not get one");
            assert(error.message.includes(REVERT), "Expected '" + REVERT + "' but got '" + error.message + "' instead");
        }

        // tx should have failed, so all the accounts should still have the same balance
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 50);

        let balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);
        
        let balanceFive = await instance.balanceOf(accountFive);
        assert.equal(parseInt(balanceFive), 0);
    });

    it("should fail if tx has a whole parameter array empty", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx sender
        let accountFour = accounts[3];  // token receiver
        let accountFive = accounts[4];  // token receiver

        // START META TX 1 (accountTwo --> accountFour)
        let amount1 = 8;
        let relayerFee1 = 1;

        let lastNonceAccountTwo = await instance.nonceOf(accountTwo);
        let newNonceAccountTwo = parseInt(lastNonceAccountTwo) + 1;

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded1 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountTwo, accountFour, amount1, relayerFee1, newNonceAccountTwo, dueBlockNumber, instance.address, accountOne]);
        
        let hash1 = web3.utils.keccak256(valuesEncoded1);

        // create a signature
        let signature = await web3.eth.sign(hash1, accountTwo);
        let sigSlices = sliceSignature(signature);

        let meta_tx_one = {
            sender: accountTwo,
            receiver: accountFour,
            amount: amount1,
            relayerFee: relayerFee1,
            dueBlock: dueBlockNumber,
            v: sigSlices.v,
            r: sigSlices.r,
            s: sigSlices.s
        }

        // Make sure the second account has 50 tokens (from the previous test)
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);
        // END META TX 1

        // START META TX 2 (accountThree --> accountFive)
        let amount2 = 3;
        let relayerFee2 = 1;

        let lastNonceAccountThree = await instance.nonceOf(accountThree);
        let newNonceAccountThree = parseInt(lastNonceAccountThree) + 1;

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded2 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountThree, accountFive, amount2, relayerFee2, newNonceAccountThree, dueBlockNumber, instance.address, accountOne]);
        
        let hash2 = web3.utils.keccak256(valuesEncoded2);

        // create a signature
        let signature2 = await web3.eth.sign(hash2, accountThree);
        let sigSlices2 = sliceSignature(signature2);

        let meta_tx_two = {
            sender: accountThree,
            receiver: accountFive,
            amount: amount2,
            relayerFee: relayerFee2,
            dueBlock: dueBlockNumber,
            v: sigSlices2.v,
            r: sigSlices2.r,
            s: sigSlices2.s
        }

        // Make sure the third account has 50 tokens (from the previous test)
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 50);
        // END META TX 2

        // SEND META TXS BATCH (should fail)
        try {
            let result = await instance.processMetaBatch([meta_tx_one.sender, meta_tx_two.sender],
                                                        [], // EMPTY ARRAY
                                                        [meta_tx_one.amount, meta_tx_two.amount],
                                                        [meta_tx_one.relayerFee, meta_tx_two.relayerFee],
                                                        [meta_tx_one.dueBlock, meta_tx_two.dueBlock],
                                                        [meta_tx_one.v, meta_tx_two.v],
                                                        [meta_tx_one.r, meta_tx_two.r],
                                                        [meta_tx_one.s, meta_tx_two.s]);
        } catch (error) {
            const REVERT = 'Returned error: VM Exception while processing transaction: invalid opcode';
            assert(error, "Expected an error but did not get one");
            assert(error.message.includes(REVERT), "Expected '" + REVERT + "' but got '" + error.message + "' instead");
        }

        // tx should have failed, so all the accounts should still have the same balance
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 50);

        let balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 0);
        
        let balanceFive = await instance.balanceOf(accountFive);
        assert.equal(parseInt(balanceFive), 0);
    });

});
