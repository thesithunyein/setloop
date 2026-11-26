#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::{
    access_control::{
        instructions::CreateEphemeralPermissionCpi,
        structs::{EphemeralMembersArgs, EphemeralPermission, Member, PERMISSION_SEED, TX_BALANCES_FLAG, TX_LOGS_FLAG, TX_MESSAGE_FLAG},
    },
    anchor::{commit, delegate, ephemeral},
    consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
};

declare_id!("GHWCZYzCsEEiYvdCVQ5o9aYyserYiJ3TX2tqb6hS3di9");

const ROOM: &[u8] = b"room";
const OFFER: &[u8] = b"offer";
const PERMISSIONS: u8 = TX_BALANCES_FLAG | TX_LOGS_FLAG | TX_MESSAGE_FLAG;
mod matching;
use matching::{compute_settlement, valid_offer, CHOICE_STARTERS, STARTERS};

#[ephemeral]
#[program]
pub mod setloop {
    use super::*;

    pub fn create_room(ctx: Context<CreateRoom>, nonce: u64, seats: [Pubkey; 3], settler: Pubkey, duration: u16, choice_round: bool) -> Result<()> {
        require!([60, 180, 300].contains(&duration), SetloopError::Duration);
        require!(seats[0] == ctx.accounts.host.key() && seats.iter().all(|seat| *seat != Pubkey::default()), SetloopError::Seat);
        require!(seats[0] != seats[1] && seats[1] != seats[2] && seats[2] != seats[0], SetloopError::Seat);
        require!(settler != Pubkey::default() && !seats.contains(&settler), SetloopError::Seat);
        let room = &mut ctx.accounts.room;
        room.host = ctx.accounts.host.key();
        room.nonce = nonce;
        room.seats = seats;
        room.settler = settler;
        room.duration = duration;
        room.inventories = if choice_round { CHOICE_STARTERS } else { STARTERS };
        Ok(())
    }

    pub fn create_offer(ctx: Context<CreateOffer>, slot: u8) -> Result<()> {
        let seat = ctx.accounts.room.seats.get(slot as usize).ok_or(SetloopError::Seat)?;
        require_keys_eq!(*seat, ctx.accounts.player.key(), SetloopError::Seat);
        let offer = &mut ctx.accounts.offer;
        offer.room = ctx.accounts.room.key();
        offer.player = ctx.accounts.player.key();
        offer.slot = slot;
        // Keep the base-chain account blank until the permission exists on the PER.
        transfer(
            CpiContext::new(ctx.accounts.system_program.key(), Transfer {
                from: ctx.accounts.payer.to_account_info(), to: offer.to_account_info(),
            }),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(2) as u32),
        )?;
        Ok(())
    }

    pub fn delegate_room(ctx: Context<DelegateRoom>, nonce: u64) -> Result<()> {
        ctx.accounts.delegate_room(&ctx.accounts.host, &[ROOM, ctx.accounts.host.key.as_ref(), &nonce.to_le_bytes()], DelegateConfig {
            validator: Some(ctx.accounts.validator.key()), ..Default::default()
        })?;
        Ok(())
    }

    pub fn delegate_offer(ctx: Context<DelegateOffer>, slot: u8) -> Result<()> {
        let room = ctx.accounts.room.key();
        ctx.accounts.delegate_offer(&ctx.accounts.player, &[OFFER, room.as_ref(), &[slot]], DelegateConfig {
            validator: Some(ctx.accounts.validator.key()), ..Default::default()
        })?;
        Ok(())
    }

    pub fn prepare_offer(ctx: Context<PrepareOffer>, slot: u8) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(room.result == 0, SetloopError::Closed);
        let seat = room.seats.get(slot as usize).ok_or(SetloopError::Seat)?;
        require_keys_eq!(*seat, ctx.accounts.player.key(), SetloopError::Seat);
        if ctx.accounts.offer.private { return Ok(()); }
        let room_key = room.key();
        let bump = [ctx.bumps.offer];
        let seeds: &[&[u8]] = &[OFFER, room_key.as_ref(), &[slot], &bump];
        let members = vec![
            Member {flags: PERMISSIONS, pubkey: *seat},
            Member {flags: PERMISSIONS, pubkey: room.settler},
        ];
        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.offer.to_account_info(),
            permissioned_account: ctx.accounts.offer.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {is_private: true, members},
        }.invoke_signed(&[seeds])?;
        ctx.accounts.offer.private = true;
        room.connected |= 1 << slot;
        if room.connected == 0b111 && room.deadline == 0 {
            room.deadline = Clock::get()?.unix_timestamp + i64::from(room.duration);
        }
        Ok(())
    }

    pub fn seal_offer(ctx: Context<SealOffer>, slot: u8, give: u8, need: u8) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(room.result == 0 && !room.early_close && room.deadline > Clock::get()?.unix_timestamp, SetloopError::Closed);
        let seat = room.seats.get(slot as usize).ok_or(SetloopError::Seat)?;
        require_keys_eq!(*seat, ctx.accounts.player.key(), SetloopError::Seat);
        let offer = &mut ctx.accounts.offer;
        require!(offer.private, SetloopError::Privacy);
        require!(valid_offer(&room.inventories[slot as usize], give, need), SetloopError::Offer);
        offer.give = give;
        offer.need = need;
        offer.ready = true;
        room.ready |= 1 << slot;
        Ok(())
    }

    pub fn request_early_close(ctx: Context<EarlyClose>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        require!(room.result == 0 && room.ready == 0b111, SetloopError::StillOpen);
        room.early_close = true;
        Ok(())
    }

    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let room = &mut ctx.accounts.room;
        let now = Clock::get()?.unix_timestamp;
        require!(room.result == 0 && room.deadline > 0, SetloopError::Closed);
        require!(now >= room.deadline || room.early_close, SetloopError::StillOpen);
        let offers = [&mut ctx.accounts.first, &mut ctx.accounts.second, &mut ctx.accounts.third];
        for (i, offer) in offers.iter().enumerate() {
            require!(offer.private && usize::from(offer.slot) == i && offer.player == room.seats[i], SetloopError::Seat);
        }
        let proposed = offers.each_ref().map(|offer| (offer.ready, offer.give, offer.need));
        let settlement = compute_settlement(room.inventories, proposed).map_err(|_| error!(SetloopError::Offer))?;
        room.closed_at = now;
        room.result = 2;
        if let Some((inventories, donors, given)) = settlement {
            room.inventories = inventories;
            room.donors = donors;
            room.given = given;
            room.result = 1;
        }
        for offer in offers {
            offer.give = 0;
            offer.need = 0;
            offer.ready = false;
        }
        Ok(())
    }

    pub fn publish_receipt(ctx: Context<PublishReceipt>) -> Result<()> {
        require!(ctx.accounts.room.result != 0, SetloopError::StillOpen);
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        ).commit_and_undelegate(&[ctx.accounts.room.to_account_info()]).build_and_invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateRoom<'info> {
    #[account(mut)] pub host: Signer<'info>,
    #[account(init, payer = host, space = 8 + Room::INIT_SPACE, seeds = [ROOM, host.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub room: Account<'info, Room>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct CreateOffer<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    pub player: Signer<'info>,
    pub room: Account<'info, Room>,
    #[account(init, payer = payer, space = 8 + Offer::INIT_SPACE, seeds = [OFFER, room.key().as_ref(), &[slot]], bump)]
    pub offer: Account<'info, Offer>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct DelegateRoom<'info> {
    #[account(mut)] pub host: Signer<'info>,
    /// CHECK: PDA and validator are restricted below; delegation authenticates ownership.
    #[account(mut, del, seeds = [ROOM, host.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub room: UncheckedAccount<'info>,
    /// CHECK: The client selects its PER validator.
    pub validator: UncheckedAccount<'info>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct DelegateOffer<'info> {
    #[account(mut)] pub player: Signer<'info>,
    #[account(constraint = room.seats.get(slot as usize) == Some(&player.key()) @ SetloopError::Seat)]
    pub room: Account<'info, Room>,
    /// CHECK: PDA and delegated owner are verified by the delegation program.
    #[account(mut, del, seeds = [OFFER, room.key().as_ref(), &[slot]], bump)]
    pub offer: UncheckedAccount<'info>,
    /// CHECK: The client selects the same PER validator as the room.
    pub validator: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct PrepareOffer<'info> {
    pub player: Signer<'info>,
    #[account(mut)] pub room: Account<'info, Room>,
    #[account(mut, seeds = [OFFER, room.key().as_ref(), &[slot]], bump, has_one = room, has_one = player)]
    pub offer: Account<'info, Offer>,
    /// CHECK: The permission program owns the verified PDA.
    #[account(mut, seeds = [PERMISSION_SEED, offer.key().as_ref()], bump, seeds::program = PERMISSION_PROGRAM_ID)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Address is constrained to the permission program.
    #[account(address = PERMISSION_PROGRAM_ID)] pub permission_program: UncheckedAccount<'info>,
    /// CHECK: Address is constrained to the MagicBlock vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)] pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Address is constrained to the MagicBlock program.
    #[account(address = MAGIC_PROGRAM_ID)] pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(slot: u8)]
pub struct SealOffer<'info> {
    pub player: Signer<'info>,
    #[account(mut)] pub room: Account<'info, Room>,
    #[account(mut, seeds = [OFFER, room.key().as_ref(), &[slot]], bump, has_one = room, has_one = player)]
    pub offer: Account<'info, Offer>,
}

#[derive(Accounts)]
pub struct EarlyClose<'info> {
    pub host: Signer<'info>,
    #[account(mut, has_one = host)] pub room: Account<'info, Room>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    pub settler: Signer<'info>,
    #[account(mut, has_one = settler)] pub room: Account<'info, Room>,
    #[account(mut, seeds = [OFFER, room.key().as_ref(), &[0]], bump, has_one = room)] pub first: Account<'info, Offer>,
    #[account(mut, seeds = [OFFER, room.key().as_ref(), &[1]], bump, has_one = room)] pub second: Account<'info, Offer>,
    #[account(mut, seeds = [OFFER, room.key().as_ref(), &[2]], bump, has_one = room)] pub third: Account<'info, Offer>,
}

#[commit]
#[derive(Accounts)]
pub struct PublishReceipt<'info> {
    #[account(mut)] pub payer: Signer<'info>,
    #[account(mut)] pub room: Account<'info, Room>,
}

#[account]
#[derive(InitSpace)]
pub struct Room {
    host: Pubkey,
    nonce: u64,
    seats: [Pubkey; 3],
    settler: Pubkey,
    duration: u16,
    deadline: i64,
    connected: u8,
    ready: u8,
    early_close: bool,
    result: u8,
    closed_at: i64,
    inventories: [[u8; 3]; 3],
    donors: [u8; 3],
    given: [u8; 3],
}

#[account]
#[derive(InitSpace)]
pub struct Offer {
    room: Pubkey,
    player: Pubkey,
    slot: u8,
    private: bool,
    ready: bool,
    give: u8,
    need: u8,
}

#[error_code]
pub enum SetloopError {
    #[msg("Choose a one, three or five minute round.")] Duration,
    #[msg("The seat is missing, duplicated, or belongs to another wallet.")] Seat,
    #[msg("The room is not accepting offers.")] Closed,
    #[msg("The room is still collecting offers.")] StillOpen,
    #[msg("Set up the private account before storing an offer.")] Privacy,
    #[msg("The give stamp must be a duplicate and the need stamp must be missing.")] Offer,
}
