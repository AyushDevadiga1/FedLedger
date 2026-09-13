/**
 * deploy.js
 * Deploys FLAuditLog.sol to local Hardhat Ethereum node.
 * Run from the blockchain/ directory:
 *   npx hardhat run scripts/deploy.js --network localhost
 *
 * After running, the contract address is saved automatically into:
 *   blockchain/contract_config.json
 */

const fs = require("fs");
const path = require("path");

async function main() {
  // TODO:
  // 1. Get the contract factory:
  //    const FLAuditLog = await ethers.getContractFactory("FLAuditLog");
  //
  // 2. Deploy the contract:
  //    const contract = await FLAuditLog.deploy();
  //    await contract.deployed();
  //
  // 3. Print contract address:
  //    console.log("FLAuditLog deployed to:", contract.address);
  //
  // 4. Save ABI and address to contract_config.json:
  //    const artifactPath = "./artifacts/contracts/FLAuditLog.sol/FLAuditLog.json";
  //    const config = {
  //      contract_address: contract.address,
  //      abi_path: artifactPath
  //    };
  //    fs.writeFileSync(
  //      path.join(__dirname, "../contract_config.json"),
  //      JSON.stringify(config, null, 2)
  //    );
  //    console.log("Config saved to contract_config.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });