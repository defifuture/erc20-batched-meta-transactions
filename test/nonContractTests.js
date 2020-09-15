describe("Non contract tests", function() {
    let accounts;
  
    before(async function() {
        accounts = await web3.eth.getAccounts();
    });

    describe("Test sending ETH", function() {
        // send some ether to another address
        it("should make the contract deployer send some ETH to another address", async() => {
            let sender = accounts[0];
            let receiver = accounts[1];
            let amount = web3.utils.toWei("1", 'ether')

            //console.log("Sender: " + sender);
            //console.log("Receiver: " + receiver);
            //console.log("Amount: " + amount + " WEI");

            let balanceSender = await web3.eth.getBalance(sender);
            //console.log("Sender balance: " + balanceSender);

            let balanceReceiverBefore = await web3.eth.getBalance(receiver);
            //console.log("Receiver balance (before): " + balanceReceiverBefore);

            let tx = {
                from: sender,
                to: receiver,
                value: amount,
                gasPrice: web3.utils.toBN(20000000000),
                gas: web3.utils.toBN(6721975)
            };

            let result = await web3.eth.sendTransaction(tx);
            // console.log(result);

            let balanceReceiverAfter = await web3.eth.getBalance(receiver);
            //console.log("Receiver balance (after): " + balanceReceiverAfter);

            // assert that the receiver's balance has increased by 1 ETH
            assert.equal(amount, balanceReceiverAfter-balanceReceiverBefore);
        });
    });

    /*
    // run this if you need a JSON file of public/private keys
    describe("Generate keys", async function() {
        let testRounds = 0;
        let keys = [];

        for(let i = 0; i < testRounds; i++) {
            // create a random sender address
            sender = await web3.eth.accounts.create(web3.utils.randomHex(32));

            keys.push({"address": sender.address, "privateKey": sender.privateKey});
        }

        // console.log(keys);

        
        let jsonString = JSON.stringify(keys);

        let fs = require('fs');

        fs.writeFile("test/keys.json", jsonString, function(err, result) {
            if(err) console.log('error', err);
        });
        

        console.log("load json");

        let jsonFile = require('./keys.json');
        console.log(jsonFile[0]);
        console.log(jsonFile[0].address);

        //let readJson = JSON.parse(jsonString);
        //console.log(readJson[0].address);
    });
    */
});