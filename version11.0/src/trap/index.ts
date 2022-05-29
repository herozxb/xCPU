import { CSRInterface } from "../csr";
import { RegisterBank } from "../reigster-bank";

export enum MCause {
  // Interrupts
  UserSoftwareInterrupt = 0x8000_0000,
  SupervisorSoftwareInterrupt,
  Reserved0,
  MachineSoftwareInterrupt,
  UserTimerInterrupt,
  SupervisorTimerInterrupt,
  Reserved1,
  MachineTimerInterrupt,
  UserExternalInterrupt,
  SupervisorExternalInterrupt,
  Reserved2,
  MachineExternalInterrupt,

  // Exceptions
  InstructionAddressMisaligned = 0x0000_0000,
  InstructionAccessFault,
  IllegalInstruction,
  Breakpoint,
  LoadAddressMisaligned,
  LoadAccessFault,
  StoreAMOAddressMisaligned,
  StoreAMOAccessFault,
  EnvironmentCallFromUMode,
  EnvironmentCallFromSMode,
  Reserved3,
  EnvironmentCallFromMMode,
  InstructionPageFault,
  LoadPageFault,
  Reserved4,
  StoreAMOPageFault,
}

export type TrapParams = {
  csr: CSRInterface;
  beginTrap: () => boolean;
  beginTrapReturn: () => boolean;
}

export enum TrapState {
  Idle,
  SetCSRJump,
  ReturnFromTrap,
  SetPc,
}

export const MSTATUS_MIE_BIT = 3;
export const MSTATUS_MIE_MASK = (1 << MSTATUS_MIE_BIT);
export const MSTATUS_MPIE_BIT = 7;
export const MSTATUS_MPIE_MASK = (1 << MSTATUS_MPIE_BIT);

export class Trap {
  regs = new RegisterBank();

  csr: TrapParams['csr'];
  beginTrap: TrapParams['beginTrap'];
  beginTrapReturn: TrapParams['beginTrapReturn'];

  state = this.regs.addRegister('state', TrapState.Idle);

  mepc = this.regs.addRegister('mepc');
  mcause = this.regs.addRegister('mcause');
  mtval = this.regs.addRegister('mtval');
  returnToPipelineMode = this.regs.addRegister('returnToPipelineMode');

  flush = this.regs.addRegister('flush');
  setPc = this.regs.addRegister('setPc');
  pcToSet = this.regs.addRegister('pcToSet');

  constructor(params: TrapParams) {
    this.csr = params.csr;
    this.beginTrap = params.beginTrap;
    this.beginTrapReturn = params.beginTrapReturn;
  }

  trapException(mepc: number, mcause: number, mtval: number) {
    this.mepc.value = mepc;
    this.mcause.value = mcause;
    this.mtval.value = mtval;

    this.state.value = TrapState.SetCSRJump;
  }

  trapReturn() {
    this.state.value = TrapState.ReturnFromTrap;
  }

  compute() {
    if (this.beginTrap()) {
      this.state.value = TrapState.SetCSRJump;
      this.flush.value = 1;
    } else if (this.beginTrapReturn()) {
      this.state.value = TrapState.ReturnFromTrap;
      this.flush.value = 1;
    } else {
      switch (this.state.value) {
        case TrapState.Idle: {
          this.returnToPipelineMode.value = 0;
          this.setPc.value = 0;
          this.flush.value = 0;
          return;
        }

        case TrapState.SetCSRJump: {
          this.csr.mepc = this.mepc.value;
          this.csr.mcause = this.mcause.value;
          this.csr.mtval = this.mtval.value;

          const mie = (this.csr.mstatus & MSTATUS_MIE_MASK) >> MSTATUS_MIE_BIT;
          // Unset MPIE bit
          this.csr.mstatus = (this.csr.mstatus & ~MSTATUS_MPIE_MASK) >>> 0;
          // Save MIE to MPIE
          this.csr.mstatus = (this.csr.mstatus | (mie << MSTATUS_MPIE_BIT)) >>> 0;
          // Unset mie
          this.csr.mstatus = (this.csr.mstatus & ~MSTATUS_MIE_MASK) >>> 0;

          const index = this.mcause.value & 0x7fff_ffff;
          const isInterrupt = this.mcause.value & 0x8000_0000;
          const offset = isInterrupt ? 0 : 48;

          this.pcToSet.value = (this.csr.mtvec & 0xfffffffc) + offset + (index << 2);

          this.setPc.value = 1;
          this.returnToPipelineMode.value = 1;
          this.flush.value = 0;

          this.state.value = TrapState.Idle;

          return;
        }

        case TrapState.SetPc: {
          this.setPc.value = 1;
          this.returnToPipelineMode.value = 1;
          this.state.value = TrapState.Idle;
          this.flush.value = 0;
          return;
        }

        case TrapState.ReturnFromTrap: {
          this.pcToSet.value = this.csr.mepc;
          this.state.value = TrapState.SetPc;
          this.flush.value = 0;

          const mpie = (this.csr.mstatus & MSTATUS_MPIE_MASK) >> MSTATUS_MPIE_BIT;
          // Unset MIE bit
          this.csr.mstatus = (this.csr.mstatus & ~MSTATUS_MIE_MASK) >>> 0;
          // Save MPIE to MIE
          this.csr.mstatus = (this.csr.mstatus | (mpie << MSTATUS_MIE_BIT)) >>> 0;
          // Unset mpie
          this.csr.mstatus = (this.csr.mstatus & ~MSTATUS_MPIE_MASK) >>> 0;

          return;
        }
      }
    }
  }

  latchNext() {
    this.regs.latchNext();
  }
}

