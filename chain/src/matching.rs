pub const STARTERS: [[u8; 3]; 3] = [[2, 1, 0], [0, 2, 1], [1, 0, 2]];
pub const CHOICE_STARTERS: [[u8; 3]; 3] = [[2, 2, 0], [0, 2, 2], [2, 0, 2]];

pub fn valid_offer(inventory: &[u8; 3], give: u8, need: u8) -> bool {
    inventory.get(give as usize).is_some_and(|count| *count > 1)
        && inventory.get(need as usize) == Some(&0)
}

type Settlement = ([[u8; 3]; 3], [u8; 3], [u8; 3]);

#[derive(Debug, PartialEq, Eq)]
pub struct InvalidOffer;

pub fn compute_settlement(
    mut inventories: [[u8; 3]; 3],
    offers: [(bool, u8, u8); 3],
) -> Result<Option<Settlement>, InvalidOffer> {
    if offers.iter().any(|offer| !offer.0) {
        return Ok(None);
    }
    for (inventory, &(_, give, need)) in inventories.iter().zip(&offers) {
        if !valid_offer(inventory, give, need) {
            return Err(InvalidOffer);
        }
    }
    let mut donors = [u8::MAX; 3];
    let mut used = 0u8;
    for (recipient, &(_, _, need)) in offers.iter().enumerate() {
        let Some(donor) = offers.iter().enumerate().find_map(|(index, &(_, give, _))| {
            (index != recipient && give == need).then_some(index)
        }) else {
            return Ok(None);
        };
        if used & (1 << donor) != 0 {
            return Ok(None);
        }
        donors[recipient] = donor as u8;
        used |= 1 << donor;
    }
    let given = offers.map(|offer| offer.1);
    for (recipient, donor) in donors.into_iter().enumerate() {
        let donor = donor as usize;
        let index = given[donor] as usize;
        inventories[donor][index] -= 1;
        inventories[recipient][index] += 1;
    }
    Ok(Some((inventories, donors, given)))
}

#[cfg(test)]
mod tests {
    use super::*;

    const OFFERS: [(bool, u8, u8); 3] = [(true, 0, 2), (true, 1, 0), (true, 2, 1)];

    #[test]
    fn settles_three_player_cycle() {
        let (inventories, donors, _) = compute_settlement(STARTERS, OFFERS).unwrap().unwrap();
        assert_eq!(inventories, [[1, 1, 1]; 3]);
        assert_eq!(donors, [2, 0, 1]);
    }

    #[test]
    fn incomplete_cycle_has_no_settlement() {
        let mut offers = OFFERS;
        offers[2].0 = false;
        assert_eq!(compute_settlement(STARTERS, offers), Ok(None));
    }

    #[test]
    fn stale_inventory_is_rejected_before_transfers() {
        let mut inventory = STARTERS;
        inventory[1][1] = 1;
        assert_eq!(compute_settlement(inventory, OFFERS), Err(InvalidOffer));
    }

    #[test]
    fn choice_round_can_match_in_both_directions() {
        let reverse = [(true, 1, 2), (true, 2, 0), (true, 0, 1)];
        for offers in [OFFERS, reverse] {
            let (inventories, _, _) = compute_settlement(CHOICE_STARTERS, offers).unwrap().unwrap();
            assert!(inventories.iter().all(|album| album.contains(&2) && !album.contains(&0)));
        }
    }

    #[test]
    fn three_valid_but_incompatible_offers_do_not_settle() {
        let offers = [(true, 1, 2), (true, 1, 0), (true, 2, 1)];
        assert_eq!(compute_settlement(CHOICE_STARTERS, offers), Ok(None));
    }
}
