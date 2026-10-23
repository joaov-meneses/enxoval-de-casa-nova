// Application icon facade: official Animate UI icons plus local household extensions.
import { adaptIcon } from "./animate-ui/icons/adapt-icon";
import { createHouseholdIcon } from "./animate-ui/icons/create-household-icon";
import { householdIconNodes } from "./animate-ui/icons/custom-nodes";
export type { IconComponent, IconProps } from "./animate-ui/icons/adapt-icon";
import { ArrowDown as ArrowDownArtwork } from "./animate-ui/icons/arrow-down";
import { ArrowLeft as ArrowLeftArtwork } from "./animate-ui/icons/arrow-left";
import { ArrowRight as ArrowRightArtwork } from "./animate-ui/icons/arrow-right";
import { ArrowUp as ArrowUpArtwork } from "./animate-ui/icons/arrow-up";
import { Bell as BellArtwork } from "./animate-ui/icons/bell";
import { CalendarCheck as CalendarCheckArtwork } from "./animate-ui/icons/calendar-check";
import { CalendarClock as CalendarClockArtwork } from "./animate-ui/icons/calendar-clock";
import { CalendarDays as CalendarDaysArtwork } from "./animate-ui/icons/calendar-days";
import { Camera as CameraArtwork } from "./animate-ui/icons/camera";
import { Check as CheckArtwork } from "./animate-ui/icons/check";
import { ChevronDown as ChevronDownArtwork } from "./animate-ui/icons/chevron-down";
import { ChevronLeft as ChevronLeftArtwork } from "./animate-ui/icons/chevron-left";
import { ChevronRight as ChevronRightArtwork } from "./animate-ui/icons/chevron-right";
import { ChevronUp as ChevronUpArtwork } from "./animate-ui/icons/chevron-up";
import { CircleAlert as CircleAlertArtwork } from "./animate-ui/icons/circle-alert";
import { CircleCheck as CircleCheckArtwork } from "./animate-ui/icons/circle-check";
import { CircleQuestionMark as CircleQuestionMarkArtwork } from "./animate-ui/icons/circle-question-mark";
import { ClipboardCheck as ClipboardCheckArtwork } from "./animate-ui/icons/clipboard-check";
import { Clock as ClockArtwork } from "./animate-ui/icons/clock";
import { Clock3 as Clock3Artwork } from "./animate-ui/icons/clock-3";
import { Coffee as CoffeeArtwork } from "./animate-ui/icons/coffee";
import { Copy as CopyArtwork } from "./animate-ui/icons/copy";
import { CreditCard as CreditCardArtwork } from "./animate-ui/icons/credit-card";
import { Download as DownloadArtwork } from "./animate-ui/icons/download";
import { ExternalLink as ExternalLinkArtwork } from "./animate-ui/icons/external-link";
import { Eye as EyeArtwork } from "./animate-ui/icons/eye";
import { EyeOff as EyeOffArtwork } from "./animate-ui/icons/eye-off";
import { Flame as FlameArtwork } from "./animate-ui/icons/flame";
import { Gift as GiftArtwork } from "./animate-ui/icons/gift";
import { Heart as HeartArtwork } from "./animate-ui/icons/heart";
import { House as HouseArtwork } from "./animate-ui/icons/house";
import { KeyRound as KeyRoundArtwork } from "./animate-ui/icons/key-round";
import { Layers as LayersArtwork } from "./animate-ui/icons/layers";
import { LayoutDashboard as LayoutDashboardArtwork } from "./animate-ui/icons/layout-dashboard";
import { Leaf as LeafArtwork } from "./animate-ui/icons/leaf";
import { Lightbulb as LightbulbArtwork } from "./animate-ui/icons/lightbulb";
import { Link2 as Link2Artwork } from "./animate-ui/icons/link-2";
import { LoaderCircle as LoaderCircleArtwork } from "./animate-ui/icons/loader-circle";
import { Lock as LockArtwork } from "./animate-ui/icons/lock";
import { LockKeyhole as LockKeyholeArtwork } from "./animate-ui/icons/lock-keyhole";
import { LockOpen as LockOpenArtwork } from "./animate-ui/icons/lock-open";
import { LogOut as LogOutArtwork } from "./animate-ui/icons/log-out";
import { MailCheck as MailCheckArtwork } from "./animate-ui/icons/mail-check";
import { MapPin as MapPinArtwork } from "./animate-ui/icons/map-pin";
import { Menu as MenuArtwork } from "./animate-ui/icons/menu";
import { MessageCircleHeart as MessageCircleHeartArtwork } from "./animate-ui/icons/message-circle-heart";
import { Minus as MinusArtwork } from "./animate-ui/icons/minus";
import { Moon as MoonArtwork } from "./animate-ui/icons/moon";
import { PartyPopper as PartyPopperArtwork } from "./animate-ui/icons/party-popper";
import { Pause as PauseArtwork } from "./animate-ui/icons/pause";
import { Pencil as PencilArtwork } from "./animate-ui/icons/pencil";
import { Play as PlayArtwork } from "./animate-ui/icons/play";
import { Plus as PlusArtwork } from "./animate-ui/icons/plus";
import { RefreshCw as RefreshCwArtwork } from "./animate-ui/icons/refresh-cw";
import { Search as SearchArtwork } from "./animate-ui/icons/search";
import { Share2 as Share2Artwork } from "./animate-ui/icons/share-2";
import { ShieldCheck as ShieldCheckArtwork } from "./animate-ui/icons/shield-check";
import { ShoppingBag as ShoppingBagArtwork } from "./animate-ui/icons/shopping-bag";
import { SlidersHorizontal as SlidersHorizontalArtwork } from "./animate-ui/icons/sliders-horizontal";
import { Sparkles as SparklesArtwork } from "./animate-ui/icons/sparkles";
import { Trash2 as Trash2Artwork } from "./animate-ui/icons/trash-2";
import { TrendingDown as TrendingDownArtwork } from "./animate-ui/icons/trending-down";
import { TrendingUp as TrendingUpArtwork } from "./animate-ui/icons/trending-up";
import { TriangleAlert as TriangleAlertArtwork } from "./animate-ui/icons/triangle-alert";
import { Upload as UploadArtwork } from "./animate-ui/icons/upload";
import { User as UserArtwork } from "./animate-ui/icons/user";
import { UserRound as UserRoundArtwork } from "./animate-ui/icons/user-round";
import { Users as UsersArtwork } from "./animate-ui/icons/users";
import { Wallet as WalletArtwork } from "./animate-ui/icons/wallet";
import { X as XArtwork } from "./animate-ui/icons/x";
const AlignLeftArtwork = createHouseholdIcon(householdIconNodes.AlignLeft);
const ArmchairArtwork = createHouseholdIcon(householdIconNodes.Armchair);
const ArrowUpRightArtwork = createHouseholdIcon(
  householdIconNodes.ArrowUpRight,
);
const BadgePercentArtwork = createHouseholdIcon(
  householdIconNodes.BadgePercent,
);
const BathArtwork = createHouseholdIcon(householdIconNodes.Bath);
const BedDoubleArtwork = createHouseholdIcon(householdIconNodes.BedDouble);
const BedSingleArtwork = createHouseholdIcon(householdIconNodes.BedSingle);
const BugArtwork = createHouseholdIcon(householdIconNodes.Bug);
const Building2Artwork = createHouseholdIcon(householdIconNodes.Building2);
const CircleArtwork = createHouseholdIcon(householdIconNodes.Circle);
const CircleDashedArtwork = createHouseholdIcon(
  householdIconNodes.CircleDashed,
);
const CombineArtwork = createHouseholdIcon(householdIconNodes.Combine);
const CookingPotArtwork = createHouseholdIcon(householdIconNodes.CookingPot);
const DoorOpenArtwork = createHouseholdIcon(householdIconNodes.DoorOpen);
const FileSpreadsheetArtwork = createHouseholdIcon(
  householdIconNodes.FileSpreadsheet,
);
const Flower2Artwork = createHouseholdIcon(householdIconNodes.Flower2);
const FolderDownArtwork = createHouseholdIcon(householdIconNodes.FolderDown);
const GripVerticalArtwork = createHouseholdIcon(
  householdIconNodes.GripVertical,
);
const HeartHandshakeArtwork = createHouseholdIcon(
  householdIconNodes.HeartHandshake,
);
const ImagePlusArtwork = createHouseholdIcon(householdIconNodes.ImagePlus);
const LaptopArtwork = createHouseholdIcon(householdIconNodes.Laptop);
const LayoutGridArtwork = createHouseholdIcon(householdIconNodes.LayoutGrid);
const ListChecksArtwork = createHouseholdIcon(householdIconNodes.ListChecks);
const ListOrderedArtwork = createHouseholdIcon(householdIconNodes.ListOrdered);
const ListPlusArtwork = createHouseholdIcon(householdIconNodes.ListPlus);
const MicrowaveArtwork = createHouseholdIcon(householdIconNodes.Microwave);
const MonitorArtwork = createHouseholdIcon(householdIconNodes.Monitor);
const PackageArtwork = createHouseholdIcon(householdIconNodes.Package);
const PackageCheckArtwork = createHouseholdIcon(
  householdIconNodes.PackageCheck,
);
const PackagePlusArtwork = createHouseholdIcon(householdIconNodes.PackagePlus);
const PackageXArtwork = createHouseholdIcon(householdIconNodes.PackageX);
const PercentArtwork = createHouseholdIcon(householdIconNodes.Percent);
const PiggyBankArtwork = createHouseholdIcon(householdIconNodes.PiggyBank);
const ReceiptArtwork = createHouseholdIcon(householdIconNodes.Receipt);
const RefrigeratorArtwork = createHouseholdIcon(
  householdIconNodes.Refrigerator,
);
const RulerArtwork = createHouseholdIcon(householdIconNodes.Ruler);
const SofaArtwork = createHouseholdIcon(householdIconNodes.Sofa);
const TreePalmArtwork = createHouseholdIcon(householdIconNodes.TreePalm);
const TreesArtwork = createHouseholdIcon(householdIconNodes.Trees);
const Undo2Artwork = createHouseholdIcon(householdIconNodes.Undo2);
const EllipsisArtwork = createHouseholdIcon(householdIconNodes.Ellipsis);
const TruckArtwork = createHouseholdIcon(householdIconNodes.Truck);
const UserCheckArtwork = createHouseholdIcon(householdIconNodes.UserCheck);
const UserPlusArtwork = createHouseholdIcon(householdIconNodes.UserPlus);
const UserRoundXArtwork = createHouseholdIcon(householdIconNodes.UserRoundX);
const WashingMachineArtwork = createHouseholdIcon(
  householdIconNodes.WashingMachine,
);
const AnimatedCircleAlert = adaptIcon(CircleAlertArtwork, "circle-alert");
const AnimatedTriangleAlert = adaptIcon(TriangleAlertArtwork, "triangle-alert");
const AnimatedAlignLeft = adaptIcon(AlignLeftArtwork, "align-left");
const AnimatedArmchair = adaptIcon(ArmchairArtwork, "armchair");
const AnimatedArrowDown = adaptIcon(ArrowDownArtwork, "arrow-down");
const AnimatedArrowLeft = adaptIcon(ArrowLeftArtwork, "arrow-left");
const AnimatedArrowRight = adaptIcon(ArrowRightArtwork, "arrow-right");
const AnimatedArrowUp = adaptIcon(ArrowUpArtwork, "arrow-up");
const AnimatedArrowUpRight = adaptIcon(ArrowUpRightArtwork, "arrow-up-right");
const AnimatedBadgePercent = adaptIcon(BadgePercentArtwork, "badge-percent");
const AnimatedBath = adaptIcon(BathArtwork, "bath");
const AnimatedBedDouble = adaptIcon(BedDoubleArtwork, "bed-double");
const AnimatedBedSingle = adaptIcon(BedSingleArtwork, "bed-single");
const AnimatedBell = adaptIcon(BellArtwork, "bell");
const AnimatedBug = adaptIcon(BugArtwork, "bug");
const AnimatedBuilding2 = adaptIcon(Building2Artwork, "building-2");
const AnimatedCalendarCheck = adaptIcon(CalendarCheckArtwork, "calendar-check");
const AnimatedCalendarClock = adaptIcon(CalendarClockArtwork, "calendar-clock");
const AnimatedCalendarDays = adaptIcon(CalendarDaysArtwork, "calendar-days");
const AnimatedCamera = adaptIcon(CameraArtwork, "camera");
const AnimatedCheck = adaptIcon(CheckArtwork, "check");
const AnimatedCircleCheck = adaptIcon(CircleCheckArtwork, "circle-check");
const AnimatedChevronDown = adaptIcon(ChevronDownArtwork, "chevron-down");
const AnimatedChevronLeft = adaptIcon(ChevronLeftArtwork, "chevron-left");
const AnimatedChevronRight = adaptIcon(ChevronRightArtwork, "chevron-right");
const AnimatedChevronUp = adaptIcon(ChevronUpArtwork, "chevron-up");
const AnimatedCircleDashed = adaptIcon(CircleDashedArtwork, "circle-dashed");
const AnimatedCircleQuestionMark = adaptIcon(
  CircleQuestionMarkArtwork,
  "circle-question-mark",
);
const AnimatedCircle = adaptIcon(CircleArtwork, "circle");
const AnimatedClipboardCheck = adaptIcon(
  ClipboardCheckArtwork,
  "clipboard-check",
);
const AnimatedClock = adaptIcon(ClockArtwork, "clock");
const AnimatedClock3 = adaptIcon(Clock3Artwork, "clock-3");
const AnimatedCoffee = adaptIcon(CoffeeArtwork, "coffee");
const AnimatedCombine = adaptIcon(CombineArtwork, "combine");
const AnimatedCookingPot = adaptIcon(CookingPotArtwork, "cooking-pot");
const AnimatedCopy = adaptIcon(CopyArtwork, "copy");
const AnimatedCreditCard = adaptIcon(CreditCardArtwork, "credit-card");
const AnimatedDoorOpen = adaptIcon(DoorOpenArtwork, "door-open");
const AnimatedDownload = adaptIcon(DownloadArtwork, "download");
const AnimatedExternalLink = adaptIcon(ExternalLinkArtwork, "external-link");
const AnimatedEye = adaptIcon(EyeArtwork, "eye");
const AnimatedEyeOff = adaptIcon(EyeOffArtwork, "eye-off");
const AnimatedFileSpreadsheet = adaptIcon(
  FileSpreadsheetArtwork,
  "file-spreadsheet",
);
const AnimatedFlame = adaptIcon(FlameArtwork, "flame");
const AnimatedFlower2 = adaptIcon(Flower2Artwork, "flower-2");
const AnimatedFolderDown = adaptIcon(FolderDownArtwork, "folder-down");
const AnimatedGift = adaptIcon(GiftArtwork, "gift");
const AnimatedGripVertical = adaptIcon(GripVerticalArtwork, "grip-vertical");
const AnimatedHeart = adaptIcon(HeartArtwork, "heart");
const AnimatedHeartHandshake = adaptIcon(
  HeartHandshakeArtwork,
  "heart-handshake",
);
const AnimatedHouse = adaptIcon(HouseArtwork, "house");
const AnimatedImagePlus = adaptIcon(ImagePlusArtwork, "image-plus");
const AnimatedKeyRound = adaptIcon(KeyRoundArtwork, "key-round");
const AnimatedLaptop = adaptIcon(LaptopArtwork, "laptop");
const AnimatedLayers = adaptIcon(LayersArtwork, "layers");
const AnimatedLayoutDashboard = adaptIcon(
  LayoutDashboardArtwork,
  "layout-dashboard",
);
const AnimatedLayoutGrid = adaptIcon(LayoutGridArtwork, "layout-grid");
const AnimatedLeaf = adaptIcon(LeafArtwork, "leaf");
const AnimatedLightbulb = adaptIcon(LightbulbArtwork, "lightbulb");
const AnimatedLink2 = adaptIcon(Link2Artwork, "link-2");
const AnimatedListChecks = adaptIcon(ListChecksArtwork, "list-checks");
const AnimatedListOrdered = adaptIcon(ListOrderedArtwork, "list-ordered");
const AnimatedListPlus = adaptIcon(ListPlusArtwork, "list-plus");
const AnimatedLoaderCircle = adaptIcon(LoaderCircleArtwork, "loader-circle");
const AnimatedLock = adaptIcon(LockArtwork, "lock");
const AnimatedLockKeyhole = adaptIcon(LockKeyholeArtwork, "lock-keyhole");
const AnimatedLogOut = adaptIcon(LogOutArtwork, "log-out");
const AnimatedMailCheck = adaptIcon(MailCheckArtwork, "mail-check");
const AnimatedMapPin = adaptIcon(MapPinArtwork, "map-pin");
const AnimatedMenu = adaptIcon(MenuArtwork, "menu");
const AnimatedMessageCircleHeart = adaptIcon(
  MessageCircleHeartArtwork,
  "message-circle-heart",
);
const AnimatedMicrowave = adaptIcon(MicrowaveArtwork, "microwave");
const AnimatedMinus = adaptIcon(MinusArtwork, "minus");
const AnimatedMonitor = adaptIcon(MonitorArtwork, "monitor");
const AnimatedMoon = adaptIcon(MoonArtwork, "moon");
const AnimatedPackage = adaptIcon(PackageArtwork, "package");
const AnimatedPackageCheck = adaptIcon(PackageCheckArtwork, "package-check");
const AnimatedPackagePlus = adaptIcon(PackagePlusArtwork, "package-plus");
const AnimatedPackageX = adaptIcon(PackageXArtwork, "package-x");
const AnimatedPartyPopper = adaptIcon(PartyPopperArtwork, "party-popper");
const AnimatedPause = adaptIcon(PauseArtwork, "pause");
const AnimatedPencil = adaptIcon(PencilArtwork, "pencil");
const AnimatedPercent = adaptIcon(PercentArtwork, "percent");
const AnimatedPiggyBank = adaptIcon(PiggyBankArtwork, "piggy-bank");
const AnimatedPlay = adaptIcon(PlayArtwork, "play");
const AnimatedPlus = adaptIcon(PlusArtwork, "plus");
const AnimatedReceipt = adaptIcon(ReceiptArtwork, "receipt");
const AnimatedRefreshCw = adaptIcon(RefreshCwArtwork, "refresh-cw");
const AnimatedRefrigerator = adaptIcon(RefrigeratorArtwork, "refrigerator");
const AnimatedRuler = adaptIcon(RulerArtwork, "ruler");
const AnimatedSearch = adaptIcon(SearchArtwork, "search");
const AnimatedShare2 = adaptIcon(Share2Artwork, "share-2");
const AnimatedShieldCheck = adaptIcon(ShieldCheckArtwork, "shield-check");
const AnimatedShoppingBag = adaptIcon(ShoppingBagArtwork, "shopping-bag");
const AnimatedSlidersHorizontal = adaptIcon(
  SlidersHorizontalArtwork,
  "sliders-horizontal",
);
const AnimatedSofa = adaptIcon(SofaArtwork, "sofa");
const AnimatedSparkles = adaptIcon(SparklesArtwork, "sparkles");
const AnimatedTrash2 = adaptIcon(Trash2Artwork, "trash-2");
const AnimatedTreePalm = adaptIcon(TreePalmArtwork, "tree-palm");
const AnimatedTrees = adaptIcon(TreesArtwork, "trees");
const AnimatedUndo2 = adaptIcon(Undo2Artwork, "undo-2");
const AnimatedEllipsis = adaptIcon(EllipsisArtwork, "ellipsis");
const AnimatedTrendingDown = adaptIcon(TrendingDownArtwork, "trending-down");
const AnimatedTrendingUp = adaptIcon(TrendingUpArtwork, "trending-up");
const AnimatedTruck = adaptIcon(TruckArtwork, "truck");
const AnimatedLockOpen = adaptIcon(LockOpenArtwork, "lock-open");
const AnimatedUpload = adaptIcon(UploadArtwork, "upload");
const AnimatedUser = adaptIcon(UserArtwork, "user");
const AnimatedUserCheck = adaptIcon(UserCheckArtwork, "user-check");
const AnimatedUserPlus = adaptIcon(UserPlusArtwork, "user-plus");
const AnimatedUserRound = adaptIcon(UserRoundArtwork, "user-round");
const AnimatedUserRoundX = adaptIcon(UserRoundXArtwork, "user-round-x");
const AnimatedUsers = adaptIcon(UsersArtwork, "users");
const AnimatedWallet = adaptIcon(WalletArtwork, "wallet");
const AnimatedWashingMachine = adaptIcon(
  WashingMachineArtwork,
  "washing-machine",
);
const AnimatedX = adaptIcon(XArtwork, "x");
export { AnimatedCircleAlert as AlertCircle };
export { AnimatedTriangleAlert as AlertTriangle };
export { AnimatedAlignLeft as AlignLeft };
export { AnimatedArmchair as Armchair };
export { AnimatedArrowDown as ArrowDown };
export { AnimatedArrowLeft as ArrowLeft };
export { AnimatedArrowRight as ArrowRight };
export { AnimatedArrowUp as ArrowUp };
export { AnimatedArrowUpRight as ArrowUpRight };
export { AnimatedBadgePercent as BadgePercent };
export { AnimatedBath as Bath };
export { AnimatedBedDouble as BedDouble };
export { AnimatedBedSingle as BedSingle };
export { AnimatedBell as Bell };
export { AnimatedBug as Bug };
export { AnimatedBuilding2 as Building2 };
export { AnimatedCalendarCheck as CalendarCheck };
export { AnimatedCalendarClock as CalendarClock };
export { AnimatedCalendarDays as CalendarDays };
export { AnimatedCamera as Camera };
export { AnimatedCheck as Check };
export { AnimatedCircleCheck as CheckCircle2 };
export { AnimatedCheck as CheckIcon };
export { AnimatedChevronDown as ChevronDown };
export { AnimatedChevronDown as ChevronDownIcon };
export { AnimatedChevronLeft as ChevronLeft };
export { AnimatedChevronRight as ChevronRight };
export { AnimatedChevronRight as ChevronRightIcon };
export { AnimatedChevronUp as ChevronUpIcon };
export { AnimatedCircleCheck as CircleCheck };
export { AnimatedCircleDashed as CircleDashed };
export { AnimatedCircleQuestionMark as CircleHelp };
export { AnimatedCircle as CircleIcon };
export { AnimatedClipboardCheck as ClipboardCheck };
export { AnimatedClock as Clock };
export { AnimatedClock3 as Clock3 };
export { AnimatedCoffee as Coffee };
export { AnimatedCombine as Combine };
export { AnimatedCookingPot as CookingPot };
export { AnimatedCopy as Copy };
export { AnimatedCreditCard as CreditCard };
export { AnimatedDoorOpen as DoorOpen };
export { AnimatedDownload as Download };
export { AnimatedExternalLink as ExternalLink };
export { AnimatedEye as Eye };
export { AnimatedEyeOff as EyeOff };
export { AnimatedFileSpreadsheet as FileSpreadsheet };
export { AnimatedFlame as Flame };
export { AnimatedFlower2 as Flower2 };
export { AnimatedFolderDown as FolderDown };
export { AnimatedGift as Gift };
export { AnimatedGripVertical as GripVertical };
export { AnimatedHeart as Heart };
export { AnimatedHeartHandshake as HeartHandshake };
export { AnimatedHouse as Home };
export { AnimatedHouse as House };
export { AnimatedImagePlus as ImagePlus };
export { AnimatedKeyRound as KeyRound };
export { AnimatedLaptop as Laptop };
export { AnimatedLayers as Layers };
export { AnimatedLayoutDashboard as LayoutDashboard };
export { AnimatedLayoutGrid as LayoutGrid };
export { AnimatedLeaf as Leaf };
export { AnimatedLightbulb as Lightbulb };
export { AnimatedLink2 as Link2 };
export { AnimatedListChecks as ListChecks };
export { AnimatedListOrdered as ListOrdered };
export { AnimatedListPlus as ListPlus };
export { AnimatedLoaderCircle as LoaderCircle };
export { AnimatedLock as Lock };
export { AnimatedLockKeyhole as LockKeyhole };
export { AnimatedLogOut as LogOut };
export { AnimatedMailCheck as MailCheck };
export { AnimatedMapPin as MapPin };
export { AnimatedMenu as Menu };
export { AnimatedMessageCircleHeart as MessageCircleHeart };
export { AnimatedMicrowave as Microwave };
export { AnimatedMinus as Minus };
export { AnimatedMonitor as Monitor };
export { AnimatedMoon as Moon };
export { AnimatedPackage as Package };
export { AnimatedPackageCheck as PackageCheck };
export { AnimatedPackagePlus as PackagePlus };
export { AnimatedPackageX as PackageX };
export { AnimatedPartyPopper as PartyPopper };
export { AnimatedPause as Pause };
export { AnimatedPencil as Pencil };
export { AnimatedPercent as Percent };
export { AnimatedPiggyBank as PiggyBank };
export { AnimatedPlay as Play };
export { AnimatedPlus as Plus };
export { AnimatedReceipt as Receipt };
export { AnimatedRefreshCw as RefreshCw };
export { AnimatedRefrigerator as Refrigerator };
export { AnimatedRuler as Ruler };
export { AnimatedSearch as Search };
export { AnimatedShare2 as Share2 };
export { AnimatedShieldCheck as ShieldCheck };
export { AnimatedShoppingBag as ShoppingBag };
export { AnimatedSlidersHorizontal as SlidersHorizontal };
export { AnimatedSofa as Sofa };
export { AnimatedSparkles as Sparkles };
export { AnimatedTrash2 as Trash2 };
export { AnimatedTreePalm as TreePalm };
export { AnimatedTrees as Trees };
export { AnimatedTrendingDown as TrendingDown };
export { AnimatedTrendingUp as TrendingUp };
export { AnimatedTriangleAlert as TriangleAlert };
export { AnimatedTruck as Truck };
export { AnimatedLockOpen as Unlock };
export { AnimatedUpload as Upload };
export { AnimatedUser as User };
export { AnimatedUserCheck as UserCheck };
export { AnimatedUserPlus as UserPlus };
export { AnimatedUserRound as UserRound };
export { AnimatedUserRoundX as UserRoundX };
export { AnimatedUsers as Users };
export { AnimatedUndo2 as Undo2 };
export { AnimatedEllipsis as Ellipsis };
export { AnimatedWallet as Wallet };
export { AnimatedWashingMachine as WashingMachine };
export { AnimatedX as X };
export { AnimatedX as XIcon };

export const OwnedProgressIcons = [0, 1, 2].map((portion) => {
  const angle = portion === 1 ? 90 : 270,
    rad = (angle * Math.PI) / 180;
  const nodes: [string, Record<string, string | number>][] = [
    ["circle", { cx: 11, cy: 11, r: 9 }],
  ];
  if (portion)
    nodes.push([
      "path",
      {
        d: `M 11 11 L 11 2 A 9 9 0 ${angle > 180 ? 1 : 0} 1 ${11 + 9 * Math.sin(rad)} ${11 - 9 * Math.cos(rad)} Z`,
        fill: "currentColor",
      },
    ]);
  return adaptIcon(
    createHouseholdIcon(nodes, "0 0 22 22"),
    `owned-progress-${portion}`,
  );
});
