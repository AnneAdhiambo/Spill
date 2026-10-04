// Tags that place an event in a Spill community. Shared by communityService
// and the sync transport so posts are written and queried the same way.

// Dummy admin pubkey for addressable tags
const DUMMY_ADMIN_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000000";

export function communityAddress(communityId: string): string {
  return `39000:${DUMMY_ADMIN_PUBKEY}:${communityId}`;
}

export function communityTags(communityId: string): string[][] {
  return [
    ["a", communityAddress(communityId)],
    ["h", communityId],
  ];
}
