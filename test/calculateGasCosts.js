const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

const testRounds = 10; // set number of meta txs that you want to be sent in one batch (for all tests below)

function sliceSignature(signature) {
    let r = signature.slice(0, 66);
    let s = "0x" + signature.slice(66, 130);
    let v = "0x" + signature.slice(130, 132);
    v = web3.utils.toDecimal(v);

    if(v < 27) {
        v = v + 27;
    }

    return {r, s, v};
}

contract("Test #1: reference point - a normal on-chain token transfer tx", async accounts => {
    it("#1 should send tokens from one address to another (not a meta tx)", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let sender = accounts[0];
        let receiver = accounts[1];
        
        let amount = 10;

        let result = await instance.transfer(receiver, amount);
        console.log("Gas used for #1: " + result.receipt.gasUsed + "/tx");

        let balanceReceiver = await instance.balanceOf(receiver);
        assert.equal(balanceReceiver, 10)
    });
});

contract("Test #2: 1 address (relayer/sender/receiver); number of meta txs: " + testRounds, async accounts => {
    it("#2 should process" + testRounds + " txs where relayer/sender/receiver is the same address", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer, sender, and receiver

        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(lastNonce), 0);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let senders = [];
        let receivers = [];
        let amounts = [];
        let relayerFees = [];
        let nonces = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            senders.push(accountOne);
            receivers.push(accountOne);

            amount = counter + 5;
            amounts.push(amount);

            relayerFees.push(relayerFee);

            let nonce = 1 + counter;
            nonces.push(nonce);
            // console.log(nonce);

            blocks.push(dueBlockNumber);

            let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountOne, accountOne, amount, relayerFee, nonce, dueBlockNumber, instance.address, accountOne]);

            let hash = web3.utils.keccak256(valuesEncoded);

            // create a signature
            let signature = await web3.eth.sign(hash, accountOne);
            let sigSlices = sliceSignature(signature);

            vs.push(sigSlices.v);
            rs.push(sigSlices.r);
            ss.push(sigSlices.s);

            counter++;
        }

        // console.log("Counter: " + counter);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, nonces,
                                                     blocks, vs, rs, ss);
        
        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #2: " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);
    });
});

contract("Test #3: 2 addresses (one is relayer/sender, the other is receiver); number of meta txs: " + testRounds, async accounts => {
    it("#3 should process " + testRounds + " txs where relayer/sender is the one address, and receiver is another", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer and sender
        let accountTwo = accounts[1];  // receiver

        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(lastNonce), 0);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let senders = [];
        let receivers = [];
        let amounts = [];
        let relayerFees = [];
        let nonces = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            senders.push(accountOne);
            receivers.push(accountTwo);

            amount = counter + 5;
            amounts.push(amount);

            relayerFees.push(relayerFee);

            let nonce = 1 + counter;
            nonces.push(nonce);
            // console.log(nonce);

            blocks.push(dueBlockNumber);

            let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountOne, accountTwo, amount, relayerFee, nonce, dueBlockNumber, instance.address, accountOne]);

            let hash = web3.utils.keccak256(valuesEncoded);

            // create a signature
            let signature = await web3.eth.sign(hash, accountOne);
            let sigSlices = sliceSignature(signature);

            vs.push(sigSlices.v);
            rs.push(sigSlices.r);
            ss.push(sigSlices.s);

            counter++;
        }

        // console.log("Counter: " + counter);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, nonces,
                                                     blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #3: " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);
    });
});

contract("Test #4: relayer/sender is 1 address, receivers are " + testRounds + " different addresses; number of meta txs: " + testRounds, async accounts => {
    it("#4 should process " + testRounds + " txs where relayer/sender is the one address, and receiver is always a different address", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer and sender
        let accountTwo;

        let balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(lastNonce), 0);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let senders = [];
        let receivers = [];
        let amounts = [];
        let relayerFees = [];
        let nonces = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random unique ethereum address
            accountTwo = web3.utils.randomHex(20);
            //console.log(accountTwo);

            senders.push(accountOne);
            receivers.push(accountTwo);

            amount = counter + 5;
            amounts.push(amount);

            relayerFees.push(relayerFee);

            let nonce = 1 + counter;
            nonces.push(nonce);
            // console.log(nonce);

            blocks.push(dueBlockNumber);

            let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountOne, accountTwo, amount, relayerFee, nonce, dueBlockNumber, instance.address, accountOne]);

            let hash = web3.utils.keccak256(valuesEncoded);

            // create a signature
            let signature = await web3.eth.sign(hash, accountOne);
            let sigSlices = sliceSignature(signature);

            vs.push(sigSlices.v);
            rs.push(sigSlices.r);
            ss.push(sigSlices.s);

            counter++;
        }

        // console.log("Counter: " + counter);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, nonces,
                                                     blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #4: " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);

        let balanceReceiver = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver), 5);
    });
});

contract("Test #5: relayer is 1 address (never a sender/receiver), " + testRounds + " senders, " + testRounds + " receivers; number of meta txs: " + testRounds, async accounts => {    
    
    it("#5 should process " + testRounds + " txs with " + testRounds + " senders and " + testRounds + " receivers", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let relayer = accounts[0];  // contract creator and token holder

        let balanceRelayer = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer), 10000000);

        // instantiate variables
        let sender;
        let receiver;
        let amount = 10;
        let relayerFee = 1;
        let nonce = 1; // each sender will only make 1 tx
        let valuesEncoded;
        let hash;
        let sigObject;
        let sigSlices;
        let sendTokensOnchain;
        let amountTokensOnchain = 100;

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + testRounds + 1;

        let senders = [];
        let receivers = [];
        let amounts = [];
        let relayerFees = [];
        let nonces = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = await web3.eth.accounts.create(web3.utils.randomHex(32));
            senders.push(sender.address);

            // send 100 tokens on-chain from contract creator to sender
            // that's why due block number needs to be increased (because this below creates plenty new blocks)
            sendTokensOnchain = await instance.transfer(sender.address, amountTokensOnchain);

            // create a random receiver address
            receiver = web3.utils.randomHex(20);
            receivers.push(receiver);
            
            amounts.push(amount);

            relayerFees.push(relayerFee);

            nonces.push(nonce);
            // console.log(nonce);

            blocks.push(dueBlockNumber);

            valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [sender.address, receiver, amount, relayerFee, nonce, dueBlockNumber, instance.address, relayer]);
            
            hash = web3.utils.keccak256(valuesEncoded);

            // create a signature
            sigObject = await web3.eth.accounts.sign(hash, sender.privateKey);
            sigSlices = sliceSignature(sigObject.signature);

            vs.push((sigSlices.v));
            rs.push(sigSlices.r);
            ss.push(sigSlices.s);

            counter++;
        }

        // balance of a sender BEFORE sending a batch of tokens (should be 100)
        let balanceSender1 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1), amountTokensOnchain);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, nonces,
                                                     blocks, vs, rs, ss);
        // console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #5: " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balance of a sender AFTER sending a batch of tokens
        balanceSender1 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1), amountTokensOnchain - amount - relayerFee);
        
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver1), amount);

        balanceRelayer = await instance.balanceOf(relayer);
        let newRelayerBalance = 10000000 - (testRounds * amountTokensOnchain) + (testRounds * relayerFee);
        assert.equal(parseInt(balanceRelayer), newRelayerBalance);
        
    });
});