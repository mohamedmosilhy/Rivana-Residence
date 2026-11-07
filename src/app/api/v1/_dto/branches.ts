import type { BranchRow } from "@/application/branches";
import type {
  PublicBranch,
  PublicImage,
  PublicRoom,
  PublicRoomCard,
} from "@/application/public/view-models";
import type {
  BranchDetailDto,
  BranchSummaryDto,
  ImageDto,
  RoomTypeDetailDto,
  RoomTypeSummaryDto,
  StaffBranchDto,
} from "@/contracts/api/v1/branches";

// View model → HTTP DTO mapping for the branch endpoints (spec 0002). DTOs
// come from public view models, never from database rows, so the API shows
// exactly what the pages show.

function image(value: PublicImage | null): ImageDto | null {
  return value
    ? {
        src: value.src,
        alt: value.alt,
        width: value.width,
        height: value.height,
      }
    : null;
}

export function branchSummary(branch: PublicBranch): BranchSummaryDto {
  return {
    slug: branch.slug,
    name: branch.name,
    summary: branch.summary,
    city: branch.city,
    heroImage: image(branch.hero),
    onlineBookingEnabled: branch.onlineBookingEnabled,
  };
}

export function branchDetail(branch: PublicBranch): BranchDetailDto {
  return {
    ...branchSummary(branch),
    phone: branch.phone,
    email: branch.email,
    addressLine1: branch.addressLine1,
    addressLine2: branch.addressLine2,
    country: branch.country,
    latitude: branch.latitude,
    longitude: branch.longitude,
    checkInTime: branch.checkInTime,
    checkOutTime: branch.checkOutTime,
    mapEmbedUrl: branch.mapEmbedUrl,
  };
}

export function roomTypeSummary(
  branchSlug: string,
  room: PublicRoomCard,
): RoomTypeSummaryDto {
  return {
    slug: room.slug,
    name: room.name,
    accommodationType: room.accommodationType,
    shortDescription: room.shortDescription,
    maxAdults: room.facts.maxAdults,
    maxChildren: room.facts.maxChildren,
    bedroomCount: room.facts.bedroomCount,
    bathroomCount: room.facts.bathroomCount,
    heroImage: image(room.hero),
    detailUrl: `/${branchSlug}/stay/${room.slug}`,
  };
}

export function roomTypeDetail(
  branchSlug: string,
  room: PublicRoom,
): RoomTypeDetailDto {
  return {
    ...roomTypeSummary(branchSlug, room),
    sizeSqm: room.facts.sizeSqm,
    bedSummary: room.facts.bedSummary,
    viewSummary: room.facts.viewSummary,
    features: [...room.features],
    gallery: room.gallery.map((item) => image(item)!),
  };
}

export function staffBranch(
  branch: Pick<
    BranchRow,
    "id" | "slug" | "name" | "status" | "sortOrder" | "onlineBookingEnabled"
  >,
): StaffBranchDto {
  return {
    id: branch.id,
    slug: branch.slug,
    name: branch.name,
    status: branch.status,
    sortOrder: branch.sortOrder,
    onlineBookingEnabled: branch.onlineBookingEnabled,
  };
}
