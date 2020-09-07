const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

module.exports = function (deployer) {
  deployer.deploy(ERC20MetaBatch);
};
