# Based Wheel – Smart Contracts

Production-ready Base L2 contract for the Based Wheel game.

## Features

- 1 free spin / 24h (text only)
- Paid spin: exactly **0.00042 ETH**
- Prize probabilities:
  - 95% → motivational text
  - 4% → 0.001 ETH
  - 0.9% → 0.01 ETH
  - 0.09% → 0.05 ETH
  - 0.01% → JACKPOT
- Jackpot = **min(30% of pool, 1.5 ETH)**
- Admin:
  - `withdraw40()`
  - `stopGame()`
  - `emergencyWithdrawAll()`

## Setup

```bash
cd smart-contracts
npm install
