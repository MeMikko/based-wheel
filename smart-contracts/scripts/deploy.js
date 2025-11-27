const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying BasedWheel...");

  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC);

  let ownerAddress;
  try {
    ownerAddress = await provider.resolveName("elize.base.eth");
    if (!ownerAddress) throw new Error("Null ENS");
    console.log("✓ ENS resolved: elize.base.eth →", ownerAddress);
  } catch {
    console.log("⚠ ENS resolution failed, using deployer as owner");
    ownerAddress = null;
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const owner = ownerAddress || deployer.address;
  console.log("Owner for contract:", owner);

  const Wheel = await ethers.getContractFactory("BasedWheel");
  const wheel = await Wheel.deploy(owner);

  console.log("⏳ Waiting for deployment...");
  await wheel.waitForDeployment();

  console.log("🎉 BasedWheel deployed at:", wheel.target);
  console.log("Owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
