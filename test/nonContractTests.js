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
});