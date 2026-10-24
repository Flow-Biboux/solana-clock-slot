use anchor_lang::prelude::*;

// Replace with your own program id after `anchor keys sync`.
declare_id!("BuGsGWMTiDegcXukiLpf5AV2UwXFiRpgF42oAnU5ana1");

/// The assumption many older programs bake in: 400 ms per slot.
/// It is what you get from the SDK constants
/// DEFAULT_TICKS_PER_SECOND (160) / DEFAULT_TICKS_PER_SLOT (64) = 2.5 slots/s.
/// SIMD-0525 cut mainnet slots to 200 ms but left those SDK constants unchanged.
pub const LEGACY_MS_PER_SLOT: i64 = 400;

#[program]
pub mod time_vesting {
    use super::*;

    /// Stores a vesting schedule twice: once as slots (computed the "old way",
    /// assuming 400 ms slots) and once as Unix timestamps.
    /// This program holds no tokens. It only records values, for the demo.
    pub fn create_vesting(
        ctx: Context<CreateVesting>,
        amount: u64,
        cliff_secs: i64,
        duration_secs: i64,
    ) -> Result<()> {
        require!(
            cliff_secs >= 0 && duration_secs >= cliff_secs,
            VestingError::InvalidSchedule
        );

        let clock = Clock::get()?;
        let vesting = &mut ctx.accounts.vesting;

        vesting.beneficiary = ctx.accounts.beneficiary.key();
        vesting.amount = amount;

        // Slot-based schedule, legacy conversion.
        vesting.start_slot = clock.slot;
        vesting.cliff_slot = add_slots(clock.slot, legacy_secs_to_slots(cliff_secs)?)?;
        vesting.end_slot = add_slots(clock.slot, legacy_secs_to_slots(duration_secs)?)?;

        // Timestamp-based schedule.
        vesting.start_ts = clock.unix_timestamp;
        vesting.cliff_ts = add_secs(clock.unix_timestamp, cliff_secs)?;
        vesting.end_ts = add_secs(clock.unix_timestamp, duration_secs)?;

        vesting.bump = ctx.bumps.vesting;

        msg!(
            "vesting created: start_slot={} cliff_slot={} end_slot={} start_ts={} cliff_ts={} end_ts={}",
            vesting.start_slot,
            vesting.cliff_slot,
            vesting.end_slot,
            vesting.start_ts,
            vesting.cliff_ts,
            vesting.end_ts
        );
        Ok(())
    }

    /// Logs whether the cliff is reached according to each schedule.
    /// Between the two moments, the slot-based check says "unlocked"
    /// while the timestamp-based check says "locked".
    pub fn check_cliff(ctx: Context<CheckCliff>) -> Result<()> {
        let clock = Clock::get()?;
        let vesting = &ctx.accounts.vesting;

        let reached_by_slot = clock.slot >= vesting.cliff_slot;
        let reached_by_time = clock.unix_timestamp >= vesting.cliff_ts;

        msg!(
            "slot={} ts={} cliff_by_slot={} cliff_by_time={}",
            clock.slot,
            clock.unix_timestamp,
            reached_by_slot,
            reached_by_time
        );
        if reached_by_slot != reached_by_time {
            msg!("MISMATCH: slot-based and time-based schedules disagree");
        }
        Ok(())
    }
}

/// Seconds to slots, assuming 400 ms per slot (the legacy assumption).
pub fn legacy_secs_to_slots(secs: i64) -> Result<u64> {
    let slots = secs
        .checked_mul(1000)
        .ok_or(VestingError::Overflow)?
        / LEGACY_MS_PER_SLOT;
    u64::try_from(slots).map_err(|_| error!(VestingError::InvalidSchedule))
}

fn add_slots(base: u64, delta: u64) -> Result<u64> {
    base.checked_add(delta).ok_or(error!(VestingError::Overflow))
}

fn add_secs(base: i64, delta: i64) -> Result<i64> {
    base.checked_add(delta).ok_or(error!(VestingError::Overflow))
}

#[derive(Accounts)]
pub struct CreateVesting<'info> {
    #[account(mut)]
    pub beneficiary: Signer<'info>,

    #[account(
        init,
        payer = beneficiary,
        space = 8 + Vesting::INIT_SPACE,
        seeds = [b"vesting", beneficiary.key().as_ref()],
        bump
    )]
    pub vesting: Account<'info, Vesting>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckCliff<'info> {
    #[account(
        seeds = [b"vesting", vesting.beneficiary.as_ref()],
        bump = vesting.bump
    )]
    pub vesting: Account<'info, Vesting>,
}

#[account]
#[derive(InitSpace)]
pub struct Vesting {
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub start_slot: u64,
    pub cliff_slot: u64,
    pub end_slot: u64,
    pub start_ts: i64,
    pub cliff_ts: i64,
    pub end_ts: i64,
    pub bump: u8,
}

#[error_code]
pub enum VestingError {
    #[msg("cliff must be >= 0 and duration must be >= cliff")]
    InvalidSchedule,
    #[msg("arithmetic overflow")]
    Overflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ten_minutes_is_1500_legacy_slots() {
        // 600 s / 0.4 s = 1500 slots. At 200 ms that is only 300 s of real time.
        assert_eq!(legacy_secs_to_slots(600).unwrap(), 1_500);
    }

    #[test]
    fn one_year_at_400ms() {
        // 365 days at 400 ms = 78_840_000 slots.
        assert_eq!(legacy_secs_to_slots(365 * 24 * 3600).unwrap(), 78_840_000);
    }

    #[test]
    fn negative_rejected() {
        assert!(legacy_secs_to_slots(-1).is_err());
    }
}
