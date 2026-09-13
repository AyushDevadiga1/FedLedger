require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: "0.8.19",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      // Hardhat provides 20 test accounts automatically
      // No private key configuration needed for local development
    },
  },
};