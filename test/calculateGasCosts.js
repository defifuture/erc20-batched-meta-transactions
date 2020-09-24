const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

const testRounds = 5; // set number of meta txs that you want to be sent in one batch (for all tests below)

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

contract("Test #1 (on-chain): reference point - a normal on-chain token transfer tx", async accounts => {

    it("#1a (first tx) should send tokens from one address to another (not a meta tx)", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let sender = accounts[0];
        let receiver = accounts[1];
        
        let amount = 10;

        let result = await instance.transfer(receiver, amount);
        console.log("Gas used for #1: " + result.receipt.gasUsed + "/tx");

        let balanceReceiver = await instance.balanceOf(receiver);
        assert.equal(balanceReceiver, 10)
    });

    it("#1b (second tx) should send additional tokens from one address to another (not a meta tx)", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let sender = accounts[0];
        let receiver = accounts[1];
        
        let amount = 10;

        let result = await instance.transfer(receiver, amount);
        console.log("Gas used for #1: " + result.receipt.gasUsed + "/tx");

        let balanceReceiver = await instance.balanceOf(receiver);
        assert.equal(balanceReceiver, 20)
    });
});

contract("Test #2 (1 address): relayer/sender/receiver is a single address; number of meta txs: " + testRounds, async accounts => {
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
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        
        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #2: " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        balanceOne = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceOne), 10000000);

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);
    });
});

contract("Test #3 (1-to-1): 2 addresses (one is relayer/sender, the other is receiver); number of meta txs: " + testRounds, async accounts => {
    it("#3a (first meta tx) should process " + testRounds + " txs where relayer/sender is the one address, and receiver is another", async() => {
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
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #3a (first meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);
    });

    it("#3b (second meta tx) should process " + testRounds + " txs where relayer/sender is the one address, and receiver is another", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer and sender
        let accountTwo = accounts[1];  // receiver

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);
        // console.log("Last nonce: " + parseInt(lastNonce));

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let senders = [];
        let receivers = [];
        let amounts = [];
        let relayerFees = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            senders.push(accountOne);
            receivers.push(accountTwo);
            amounts.push(amount);
            relayerFees.push(relayerFee);

            let nonce = parseInt(lastNonce) + 1 + counter;

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

        // balances before the second meta tx
        let balanceSender1 = await instance.balanceOf(accountOne);
        let balanceReceiver1 = await instance.balanceOf(accountTwo);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #3b (second meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds*2);

        // check balances after the second meta tx
        let balanceSender2 = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount*testRounds); // sender is also relayer, hence they get the relayer fee back

        let balanceReceiver2 = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), amount*testRounds)
    });

});

contract("Test #4 (1-to-M): sender is 1 address, receivers are " + testRounds + " different addresses; number of meta txs: " + testRounds, async accounts => {
    let receivers = []; // the declaration is here so that both 4a and 4b have the same receivers
    
    it("#4a (first meta tx for receiver) should process " + testRounds + " txs where relayer/sender is the one address, and receiver is always a different address", async() => {
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
        let amounts = [];
        let relayerFees = [];
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
            amounts.push(amount);

            relayerFees.push(relayerFee);

            let nonce = 1 + counter;

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

        // balances before the second meta tx
        let balanceSender1 = await instance.balanceOf(accountOne);
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #4a (first meta tx for receiver): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds);

        // check balances after the second meta tx
        let balanceSender2 = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount*testRounds); // sender is also relayer, hence they get the relayer fee back

        let balanceReceiver2 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), amount)
    });

    it("#4b (second meta tx for receiver) should process " + testRounds + " txs where relayer/sender is the one address, and receiver is always a different address", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer and sender
        let accountTwo;

        let balanceOne = await instance.balanceOf(accountOne);

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountOne);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        let senders = [];
        let amounts = [];
        let relayerFees = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            accountTwo = receivers[counter];

            senders.push(accountOne);
            amounts.push(amount);
            relayerFees.push(relayerFee);

            let nonce = parseInt(lastNonce) + 1 + counter;

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

        // balances before the second meta tx
        let balanceSender1 = await instance.balanceOf(accountOne);
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #4b (second meta tx for receiver): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");

        let currentNonce = await instance.nonceOf(accountOne);
        assert.equal(parseInt(currentNonce), testRounds*2);

        // check balances after the second meta tx
        let balanceSender2 = await instance.balanceOf(accountOne);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount*testRounds); // sender is also relayer, hence they get the relayer fee back

        let balanceReceiver2 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), amount)
    });

});

contract("Test #5 (M-to-1): " + testRounds + " senders, 1 receiver; number of meta txs: " + testRounds, async accounts => {    
    let senderObjects = [];

    it("#5a (first meta tx) should process " + testRounds + " txs with " + testRounds + " senders and 1 receiver", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let relayer = accounts[0];  // contract creator and token holder
        let receiver = accounts[1];  // receiver
        // senders are created below

        let balanceRelayer = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer), 10000000);

        // make sure the recipient has a non-zero token balance
        // uncomment the line below if you want to test a receiver with prior non-zero token balance
        // let sendTokensToReceiver = await instance.transfer(receiver, 10);

        // instantiate variables
        let sender;
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

        let receivers = [];
        let senders = [];
        let amounts = [];
        let relayerFees = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = await web3.eth.accounts.create(web3.utils.randomHex(32));
            senderObjects.push(sender);
            senders.push(sender.address);

            // send 100 tokens on-chain from contract creator to sender
            // that's why due block number needs to be increased (because this below creates plenty new blocks)
            sendTokensOnchain = await instance.transfer(sender.address, amountTokensOnchain);

            receivers.push(receiver);
            amounts.push(amount);
            relayerFees.push(relayerFee);
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

        // balances BEFORE the meta batch tx
        let balanceRelayer1 = await instance.balanceOf(relayer);
        let balanceSender1 = await instance.balanceOf(senders[0]);
        let balanceReceiver1 = await instance.balanceOf(receiver);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        // console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #5a (first meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balances AFTER the meta batch tx
        let balanceReceiver2 = await instance.balanceOf(receiver);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), (amount*testRounds));

        let balanceSender2 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount + relayerFee);

        let balanceRelayer2 = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer2)-parseInt(balanceRelayer1), relayerFee*testRounds);
        
    });

    it("#5b (second meta tx) should process " + testRounds + " txs with " + testRounds + " senders and 1 receiver", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let relayer = accounts[0];  // contract creator and token holder
        let receiver = accounts[1];  // receiver
        // senders are created below

        // instantiate variables
        let sender;
        let amount = 10;
        let relayerFee = 1;
        let nonce = 2; // each sender will only make 1 tx
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
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = senderObjects[counter];
        
            senders.push(sender.address);
            receivers.push(receiver);
            amounts.push(amount);
            relayerFees.push(relayerFee);
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

        // balances BEFORE the meta batch tx
        let balanceRelayer1 = await instance.balanceOf(relayer);
        let balanceSender1 = await instance.balanceOf(senders[0]);
        let balanceReceiver1 = await instance.balanceOf(receiver);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        // console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #5b (second meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balances AFTER the meta batch tx
        let balanceReceiver2 = await instance.balanceOf(receiver);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), (amount*testRounds));

        let balanceSender2 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount + relayerFee);

        let balanceRelayer2 = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer2)-parseInt(balanceRelayer1), relayerFee*testRounds);
        
    });

});

contract("Test #6 (M-to-M, zero receiver balance): " + testRounds + " senders, " + testRounds + " receivers; number of meta txs: " + testRounds, async accounts => {    
    let senderObjects = [];

    it("#6a (first meta tx) should process " + testRounds + " txs with " + testRounds + " senders and " + testRounds + " receivers", async() => {
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
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = await web3.eth.accounts.create(web3.utils.randomHex(32));
            senderObjects.push(sender);
            senders.push(sender.address);

            // send 100 tokens on-chain from contract creator to sender
            // that's why due block number needs to be increased (because this below creates plenty new blocks)
            sendTokensOnchain = await instance.transfer(sender.address, amountTokensOnchain);

            // create a random receiver address
            receiver = web3.utils.randomHex(20);
            receivers.push(receiver);
            
            amounts.push(amount);

            relayerFees.push(relayerFee);

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
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        // console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #6a (first meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balance of a sender AFTER sending a batch of tokens
        balanceSender1 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1), amountTokensOnchain - amount - relayerFee);
        
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver1), amount);

        balanceRelayer = await instance.balanceOf(relayer);
        let newRelayerBalance = 10000000 - (testRounds * amountTokensOnchain) + (testRounds * relayerFee);
        assert.equal(parseInt(balanceRelayer), newRelayerBalance);
        
    });

    it("#6b (second meta tx) should process " + testRounds + " txs with " + testRounds + " senders and " + testRounds + " receivers", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let relayer = accounts[0];  // contract creator and token holder

        // instantiate variables
        let sender;
        let receiver;
        let amount = 10;
        let relayerFee = 1;
        let nonce = 2;
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
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = senderObjects[counter];
            senders.push(sender.address);

            // create a random receiver address
            receiver = web3.utils.randomHex(20);
            receivers.push(receiver);
            
            amounts.push(amount);

            relayerFees.push(relayerFee);

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

        // balances BEFORE the meta batch tx
        let balanceRelayer1 = await instance.balanceOf(relayer);
        let balanceSender1 = await instance.balanceOf(senders[0]);
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        // console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #6b (second meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balances AFTER the meta batch tx
        let balanceReceiver2 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver2)-parseInt(balanceReceiver1), amount);

        let balanceSender2 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1)-parseInt(balanceSender2), amount + relayerFee);

        let balanceRelayer2 = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer2)-parseInt(balanceRelayer1), relayerFee*testRounds);
        
    });

});

contract("Test #7 (M-to-M, non-zero receiver balance): " + testRounds + " senders, " + testRounds + " receivers (with existing non-null balance); number of meta txs: " + testRounds, async accounts => {    
    
    let senderObjects = [];
    let senders = [];
    let receivers = [];

    it("#7a (first meta tx) should process " + testRounds + " txs with " + testRounds + " senders and " + testRounds + " receivers (with existing non-null balance)", async() => {
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
        let sendTokensOnchain2;
        let amountTokensOnchain = 100;

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + testRounds*2 + 1;

        let amounts = [];
        let relayerFees = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            // create a random sender address
            sender = await web3.eth.accounts.create(web3.utils.randomHex(32));
            senders.push(sender.address);
            senderObjects.push(sender);

            // send 100 tokens on-chain from contract creator to sender
            // that's why due block number needs to be increased (because this below creates plenty new blocks)
            sendTokensOnchain = await instance.transfer(sender.address, amountTokensOnchain);

            // create a random receiver address
            receiver = web3.utils.randomHex(20);
            receivers.push(receiver);

            // send tokens on-chain to receiver
            sendTokensOnchain2 = await instance.transfer(receiver, 10);
            
            amounts.push(amount);

            relayerFees.push(relayerFee);

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

        // balance of a sender BEFORE sending a batch of meta txs
        let balanceSender1 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1), amountTokensOnchain);

        // balance of a receiver BEFORE sending a batch of meta txs
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver1), 10);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        //console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #7a (first meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balance of a sender AFTER sending a batch of tokens
        balanceSender1 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1), amountTokensOnchain - amount - relayerFee);
        
        balanceReceiver1 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver1), amount + 10);

        balanceRelayer = await instance.balanceOf(relayer);
        let newRelayerBalance = 10000000 - (testRounds * amountTokensOnchain) - (testRounds * 10) + (testRounds * relayerFee);
        assert.equal(parseInt(balanceRelayer), newRelayerBalance);
        
    });

    it("#7b (second meta tx) should process " + testRounds + " txs with " + testRounds + " senders and " + testRounds + " receivers (both having existing non-null balance AND non-null nonce)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let relayer = accounts[0];  // contract creator and token holder

        // instantiate variables
        let sender;
        let receiver;
        let amount = 10;
        let relayerFee = 1;
        let nonce = 2; // each sender makes their second meta tx
        let valuesEncoded;
        let hash;
        let sigObject;
        let sigSlices;

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + testRounds*2 + 1;
        
        let amounts = [];
        let relayerFees = [];
        let blocks = [];
        let vs = [];
        let rs = [];
        let ss = [];

        let counter = 0;

        while(counter < testRounds) {
            sender = senderObjects[counter];
            receiver = receivers[counter];

            amounts.push(amount);

            relayerFees.push(relayerFee);

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

        // balance of the relayer BEFORE sending a batch of meta txs
        let balanceRelayer1 = await instance.balanceOf(relayer);

        // balance of a sender BEFORE sending a batch of meta txs
        let balanceSender1 = await instance.balanceOf(senders[0]);

        // balance of a receiver BEFORE sending a batch of meta txs
        let balanceReceiver1 = await instance.balanceOf(receivers[0]);

        // send meta batch tx
        let result = await instance.processMetaBatch(senders, receivers, amounts, relayerFees, blocks, vs, rs, ss);
        //console.log(result);

        let gasUsed = result.receipt.gasUsed;
        console.log("Gas used for #7b (second meta tx): " + gasUsed/testRounds + "/meta tx (total gas: " + gasUsed + ")");
        
        // balance of a sender AFTER sending a batch of tokens
        let balanceRelayer2 = await instance.balanceOf(relayer);
        assert.equal(parseInt(balanceRelayer2) - parseInt(balanceRelayer1), relayerFee*testRounds);

        let balanceSender2 = await instance.balanceOf(senders[0]);
        assert.equal(parseInt(balanceSender1) - parseInt(balanceSender2), amount + relayerFee);
        
        let balanceReceiver2 = await instance.balanceOf(receivers[0]);
        assert.equal(parseInt(balanceReceiver2) - parseInt(balanceReceiver1), amount);
        
    });

});
