import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  ArrowDownward,
  ArrowUpward,
  Computer,
  ContentCopy as ContentCopyIcon,
  Folder as FolderIcon,
  Home,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardDoubleArrowLeft,
  KeyboardDoubleArrowRight,
  MoreVert as MoreVertIcon,
  OpenInNew as OpenInNewIcon,
  UnfoldMore,
} from "@mui/icons-material";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import {
  CellContext,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  OnChangeFn,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { AxiosError } from "axios";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import {
  BroadcastResource,
  BroadcastResourceV2,
  BroadcastV2Config,
  ChannelType,
  ContentFolderResourceTypeEnum,
  DuplicateResourceTypeEnum,
} from "isomorphic-lib/src/types";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useUniversalRouter } from "../../lib/authModeProvider";
import { useArchiveBroadcastMutation } from "../../lib/useArchiveBroadcastMutation";
import { useBroadcastsQuery } from "../../lib/useBroadcastsQuery";
import { useCreateBroadcastMutation } from "../../lib/useCreateBroadcastMutation";
import {
  ALL_FOLDERS_FILTER,
  ROOT_FOLDER_FILTER,
  useContentFoldersQuery,
  useMoveToFolderMutation,
} from "../../lib/useContentFolders";
import { useDuplicateResourceMutation } from "../../lib/useDuplicateResourceMutation";
import {
  FolderFilterSelect,
  FolderGroupHeaderRow,
  MoveToFolderDialog,
} from "../folders/folderControls";
import { GreyButton, greyButtonStyle } from "../greyButtonStyle";

// Use the union type for the table row data
type Row = BroadcastResource | BroadcastResourceV2;

// Helper function to format status strings
function humanizeBroadcastStatus(status: string): string {
  switch (status) {
    case "NotStarted":
      return "Not Started";
    case "InProgress":
      return "In Progress";
    case "Triggered": // V1 status, might map to Running/Completed in practice
      return "Triggered (V1)"; // Clarify V1 status if needed
    case "Draft":
      return "Draft";
    case "Scheduled":
      return "Scheduled";
    case "Running":
      return "Running";
    case "Paused":
      return "Paused";
    case "Completed":
      return "Completed";
    case "Cancelled":
      return "Cancelled";
    case "Failed":
      return "Failed";
    default:
      return status; // Return original if unknown
  }
}

// Cell renderer for Actions column
function ActionsCell({ row, table }: CellContext<Row, unknown>) {
  const theme = useTheme();
  const rowId = row.original.id;
  const rowName = row.original.name;
  const isArchived = !!row.original.archived;
  const queryClient = useQueryClient();

  // Instantiate the hook directly in the cell component for the specific broadcast
  const archiveMutation = useArchiveBroadcastMutation(rowId);

  // Access functions from table meta
  const duplicateBroadcast = table.options.meta?.duplicateBroadcast;
  const moveBroadcastToFolder = table.options.meta?.moveBroadcastToFolder;

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDuplicate = () => {
    if (!duplicateBroadcast) {
      console.error("duplicateBroadcast function not found in table meta");
      return;
    }
    duplicateBroadcast(rowName);
    handleClose();
  };

  const handleArchiveToggle = () => {
    archiveMutation.mutate(
      { archived: !isArchived },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
        },
        onError: (_error) => {
          // Show error feedback
        },
      },
    );
    handleClose();
  };

  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          aria-label="actions"
          onClick={handleClick}
          size="small"
          disabled={archiveMutation.isPending}
        >
          {archiveMutation.isPending ? (
            <CircularProgress size={20} />
          ) : (
            <MoreVertIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "actions-button",
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        PaperProps={{
          sx: {
            borderRadius: 1,
            boxShadow: theme.shadows[2],
          },
        }}
      >
        <MenuItem
          onClick={() => {
            moveBroadcastToFolder?.(row.original);
            handleClose();
          }}
        >
          <FolderIcon fontSize="small" sx={{ mr: 1 }} />
          Move to folder
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem
          onClick={handleArchiveToggle}
          sx={{ color: theme.palette.grey[700] }}
          disabled={archiveMutation.isPending}
        >
          <ArchiveIcon fontSize="small" sx={{ mr: 1 }} />
          {isArchived ? "Unarchive" : "Archive"}
        </MenuItem>
        {/* Add other actions like Edit, Delete, etc. here */}
      </Menu>
    </>
  );
}

// Cell renderer for Name column
function NameCell({ row, getValue }: CellContext<Row, unknown>) {
  const name = getValue<string>();
  const broadcastId = row.original.id;
  const universalRouter = useUniversalRouter();

  const isV2 = "version" in row.original && row.original.version === "V2";
  const href = isV2
    ? universalRouter.mapUrl(`/broadcasts/v2`, { id: broadcastId })
    : `/broadcasts/${broadcastId}`;

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ maxWidth: "350px" }}
    >
      <Tooltip title={name} placement="bottom-start">
        <Typography
          variant="body2"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </Typography>
      </Tooltip>
      <Tooltip title="View Broadcast Details">
        <IconButton size="small" component={Link} href={href}>
          <OpenInNewIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

// Cell renderer for Status column
function StatusCell({ getValue }: CellContext<Row, unknown>) {
  const rawStatus = getValue<string>();
  const humanizedStatus = humanizeBroadcastStatus(rawStatus);
  // TODO: Consider using MUI Chip for better visual styling
  return <Typography variant="body2">{humanizedStatus}</Typography>;
}

// TimeCell for displaying timestamps like createdAt
function TimeCell({ getValue }: CellContext<Row, unknown>) {
  const timestamp = getValue<number>();
  if (!timestamp) {
    return null; // Or some placeholder
  }
  const date = new Date(timestamp);

  const tooltipContent = (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Computer sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Your device
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center">
        <Home sx={{ color: "text.secondary" }} />
        <Stack>
          <Typography variant="body2" color="text.secondary">
            UTC
          </Typography>
          <Typography>
            {new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
              hour12: true,
              timeZone: "UTC",
            }).format(date)}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );

  const formatted = formatDistanceToNow(date, { addSuffix: true });
  return (
    <Tooltip title={tooltipContent} placement="bottom-start" arrow>
      <Typography variant="body2">{formatted}</Typography>
    </Tooltip>
  );
}

// ScheduledAtCell for displaying the naive scheduledAt string
// This cell needs to handle the case where the property might not exist (V1)
function ScheduledAtCell({ row }: CellContext<Row, unknown>) {
  // Access scheduledAt only if it's a V2 resource
  const value =
    "scheduledAt" in row.original ? row.original.scheduledAt : undefined;
  const timezone =
    "config" in row.original ? row.original.config.defaultTimezone : undefined;

  if (!value) {
    return null; // V1 broadcasts or V2 without schedule won't show anything
  }

  // Simple display of the naive string, maybe format slightly if needed
  // Example: Remove seconds if present 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD HH:MM'
  const formattedValue = value.substring(0, 16);

  return (
    <Tooltip title={`${value} (${timezone})`} placement="bottom-start" arrow>
      <Typography variant="body2">{formattedValue}</Typography>
    </Tooltip>
  );
}

export default function BroadcastsTable() {
  const theme = useTheme();
  const universalRouter = useUniversalRouter();
  // const queryClient = useQueryClient(); // Not used directly here anymore for mutations
  // const { apiBase, workspace } = useAppStorePick(["apiBase", "workspace"]); // Not used directly here anymore for mutations

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [broadcastName, setBroadcastName] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<
    BroadcastV2Config["message"]["type"]
  >(ChannelType.Email);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "folderId", desc: false },
  ]);
  const [folderFilter, setFolderFilter] = useState(ALL_FOLDERS_FILTER);
  const [moveTarget, setMoveTarget] = useState<Row | null>(null);

  const query = useBroadcastsQuery();
  const createBroadcastMutation = useCreateBroadcastMutation();

  // Fetch folders for filtering / grouping / moving
  const foldersQuery = useContentFoldersQuery({
    resourceType: ContentFolderResourceTypeEnum.Broadcast,
  });
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const folderNameById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const folderRank = useMemo(
    () => new Map(folders.map((folder, index) => [folder.id, index])),
    [folders],
  );

  const moveToFolderMutation = useMoveToFolderMutation(
    ContentFolderResourceTypeEnum.Broadcast,
    {
      onSuccess: () => {
        setSnackbarMessage("Broadcast moved to folder.");
        setSnackbarOpen(true);
      },
      onError: () => {
        setSnackbarMessage("Failed to move broadcast to folder.");
        setSnackbarOpen(true);
      },
    },
  );

  const duplicateBroadcastMutation = useDuplicateResourceMutation({
    onSuccess: (data) => {
      setSnackbarMessage(`Broadcast duplicated as "${data.name}"!`);
      setSnackbarOpen(true);
    },
    onError: (error) => {
      console.error("Failed to duplicate broadcast:", error);
      const errorMsg =
        (error as AxiosError<{ message?: string }>).response?.data.message ??
        "API Error";
      setSnackbarMessage(`Failed to duplicate broadcast: ${errorMsg}`);
      setSnackbarOpen(true);
    },
  });

  // query.data is (BroadcastResource | BroadcastResourceV2)[]
  const rawData: Row[] = query.data ?? [];

  // Filter data based on showArchived state
  const broadcastsData: Row[] = useMemo(() => {
    if (showArchived) {
      return rawData;
    }
    // Assuming an 'archived' property exists on Row type items
    return rawData.filter((b) => !b.archived);
  }, [rawData, showArchived]);

  const visibleBroadcastsData = useMemo(() => {
    if (folderFilter === ALL_FOLDERS_FILTER) {
      return broadcastsData;
    }
    return broadcastsData.filter((broadcast) =>
      folderFilter === ROOT_FOLDER_FILTER
        ? !broadcast.folderId
        : broadcast.folderId === folderFilter,
    );
  }, [broadcastsData, folderFilter]);

  const [pagination, setPagination] = useState({
    pageIndex: 0, // initial page index
    pageSize: 10, // default page size
  });

  // Effect to show snackbar on load error
  useEffect(() => {
    if (query.isError) {
      setSnackbarMessage("Failed to load broadcasts.");
      setSnackbarOpen(true);
    }
  }, [query.isError]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    return [
      {
        id: "folderId",
        accessorFn: (row) => row.folderId ?? null,
        header: () => null,
        enableHiding: true,
        sortingFn: (a, b) => {
          const rankA = a.original.folderId
            ? (folderRank.get(a.original.folderId) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER;
          const rankB = b.original.folderId
            ? (folderRank.get(b.original.folderId) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER;
          return rankA - rankB;
        },
      },
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        cell: NameCell,
      },
      {
        id: "status",
        header: "Status",
        accessorKey: "status",
        cell: StatusCell,
      },
      {
        id: "createdAt",
        header: "Created At",
        accessorKey: "createdAt",
        cell: TimeCell,
      },
      {
        id: "scheduledAt",
        header: "Scheduled At",
        accessorKey: "scheduledAt",
        cell: ScheduledAtCell,
      },
      {
        id: "actions",
        header: "",
        size: 70, // Adjust size as needed
        cell: ActionsCell, // Use direct cell renderer
      },
    ];
  }, [folderRank]);

  // Keep the hidden folderId column as the primary sort so that rows stay
  // grouped under their folder headers.
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const userSorting = next.filter((s) => s.id !== "folderId");
      return [{ id: "folderId", desc: false }, ...userSorting];
    });
  };

  const table = useReactTable({
    columns,
    data: visibleBroadcastsData,
    getSortedRowModel: getSortedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onSortingChange: handleSortingChange,
    state: {
      pagination,
      sorting,
      columnVisibility: { folderId: false },
    },
    // Pass functions via meta
    meta: {
      duplicateBroadcast: (name: string) => {
        if (duplicateBroadcastMutation.isPending) return;
        duplicateBroadcastMutation.mutate({
          name,
          resourceType: DuplicateResourceTypeEnum.Broadcast,
        });
      },
      moveBroadcastToFolder: (row: Row) => {
        setMoveTarget(row);
      },
    },
  });

  const tableRowsWithFolders: React.ReactNode[] = [];
  let lastFolderKey: string | null | undefined;
  for (const row of table.getRowModel().rows) {
    const folderKey = row.original.folderId ?? null;
    if (folderKey !== lastFolderKey) {
      tableRowsWithFolders.push(
        <FolderGroupHeaderRow
          key={`folder-header-${folderKey ?? "root"}`}
          label={
            folderKey
              ? (folderNameById.get(folderKey) ?? "Unknown folder")
              : "Unfiled"
          }
          colSpan={table.getVisibleLeafColumns().length}
        />,
      );
      lastFolderKey = folderKey;
    }
    tableRowsWithFolders.push(
      <TableRow
        key={row.id}
        hover
        sx={{
          "&:hover": {
            backgroundColor: "action.hover",
          },
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>,
    );
  }

  const handleCreateBroadcast = () => {
    if (broadcastName.trim() && !createBroadcastMutation.isPending) {
      let broadcastConfigMessage: BroadcastV2Config["message"];
      switch (selectedChannel) {
        case ChannelType.Email:
          broadcastConfigMessage = {
            type: ChannelType.Email,
          };
          break;
        case ChannelType.Sms:
          broadcastConfigMessage = {
            type: ChannelType.Sms,
          };
          break;
        case ChannelType.Webhook:
          broadcastConfigMessage = {
            type: ChannelType.Webhook,
          };
          break;
        default:
          // Should not happen with the ToggleButtonGroup
          return;
      }
      const newBroadcastData = {
        name: broadcastName.trim(),
        config: {
          type: "V2" as const, // Explicitly set type to 'V2'
          message: broadcastConfigMessage,
          rateLimit: 10,
          batchSize: 100,
        } satisfies BroadcastV2Config,
      };
      createBroadcastMutation.mutate(newBroadcastData, {
        onSuccess: (data) => {
          // queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); // Handled by the hook
          setSnackbarMessage("Broadcast created successfully!");
          setSnackbarOpen(true);
          setDialogOpen(false);
          setBroadcastName("");
          universalRouter.push(`/broadcasts/v2`, { id: data.id });
        },
        onError: (_error) => {
          // console.error("Failed to create broadcast:", error);
          setSnackbarMessage("Failed to create broadcast.");
          setSnackbarOpen(true);
        },
      });
    }
  };

  // Handle channel type selection
  const handleChannelChange = (
    event: React.MouseEvent<HTMLElement>,
    newChannel: BroadcastV2Config["message"]["type"] | null,
  ) => {
    if (newChannel !== null) {
      setSelectedChannel(newChannel);
    }
  };

  // Handle dialog close with reset
  const closeDialog = () => {
    setDialogOpen(false);
    setBroadcastName("");
    setSelectedChannel(ChannelType.Email);
  };

  return (
    <>
      <Stack spacing={2} sx={{ height: "100%", width: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h4">Broadcasts</Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <FolderFilterSelect
              resourceType={ContentFolderResourceTypeEnum.Broadcast}
              folders={folders}
              value={folderFilter}
              onChange={setFolderFilter}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                      color: theme.palette.grey[500],
                    },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: theme.palette.grey[500],
                    },
                  }}
                />
              }
              label="Show Archived"
            />
            <Button
              variant="contained"
              sx={greyButtonStyle}
              onClick={() => setDialogOpen(true)}
              startIcon={<AddIcon />}
            >
              New Broadcast
            </Button>
          </Stack>
        </Stack>
        <TableContainer component={Paper}>
          <Table stickyHeader>
            <TableHead>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableCell
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width:
                          header.getSize() !== 150
                            ? header.getSize()
                            : undefined,
                      }}
                      sortDirection={header.column.getIsSorted() || false}
                    >
                      {header.isPlaceholder ? null : (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            cursor: header.column.getCanSort()
                              ? "pointer"
                              : "default",
                          }}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getCanSort() && (
                            <IconButton
                              onClick={header.column.getToggleSortingHandler()}
                              size="small"
                              sx={{ ml: 0.5 }}
                              aria-label={`Sort by ${header.column.columnDef.header}`}
                            >
                              {{
                                asc: <ArrowUpward fontSize="inherit" />,
                                desc: <ArrowDownward fontSize="inherit" />,
                              }[header.column.getIsSorted() as string] ?? (
                                <UnfoldMore
                                  fontSize="inherit"
                                  sx={{ opacity: 0.5 }}
                                /> // Default icon when not sorted
                              )}
                            </IconButton>
                          )}
                        </Box>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHead>
            <TableBody>
              {tableRowsWithFolders}
              {/* Handle empty state only when not loading and data is truly empty */}
              {!query.isFetching &&
                !query.isLoading &&
                visibleBroadcastsData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={columns.length} align="center">
                      No broadcasts found.
                    </TableCell>
                  </TableRow>
                )}
            </TableBody>
            <TableFooter
              sx={{
                position: "sticky",
                bottom: 0,
              }}
            >
              <TableRow>
                <TableCell
                  colSpan={table.getAllColumns().length}
                  sx={{
                    bgcolor: "background.paper",
                    borderTop: (t) => `1px solid ${t.palette.divider}`,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    justifyContent="space-between" // Space out pagination and loader
                    alignItems="center"
                  >
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <GreyButton
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                        startIcon={<KeyboardDoubleArrowLeft />}
                      >
                        First
                      </GreyButton>
                      <GreyButton
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        startIcon={<KeyboardArrowLeft />}
                      >
                        Previous
                      </GreyButton>
                      <GreyButton
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        endIcon={<KeyboardArrowRight />}
                      >
                        Next
                      </GreyButton>
                      <GreyButton
                        onClick={() =>
                          table.setPageIndex(table.getPageCount() - 1)
                        }
                        disabled={!table.getCanNextPage()}
                        endIcon={<KeyboardDoubleArrowRight />}
                      >
                        Last
                      </GreyButton>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      {/* Loading indicator similar to deliveriesTableV2 */}
                      <Box
                        sx={{
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          minWidth: "40px", // Prevent layout shift
                          justifyContent: "center",
                        }}
                      >
                        {query.isFetching && (
                          <CircularProgress color="inherit" size={20} />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Page{" "}
                        <strong>
                          {table.getState().pagination.pageIndex + 1} of{" "}
                          {table.getPageCount() === 0
                            ? 1
                            : table.getPageCount()}
                        </strong>
                      </Typography>
                    </Stack>
                  </Stack>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Stack>

      {/* Create Broadcast Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        TransitionProps={{ onEntered: () => nameInputRef.current?.focus() }}
      >
        <DialogTitle>Create New Broadcast</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            id="name"
            label="Broadcast Name"
            type="text"
            fullWidth
            variant="standard"
            value={broadcastName}
            onChange={(e) => setBroadcastName(e.target.value)}
            inputRef={nameInputRef}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleCreateBroadcast();
              }
            }}
          />
          <Typography display="block" sx={{ mt: 2, mb: 1 }}>
            Channel Type
          </Typography>
          <ToggleButtonGroup
            value={selectedChannel}
            exclusive
            onChange={handleChannelChange}
            aria-label="channel type"
            size="small"
          >
            <ToggleButton value={ChannelType.Email} aria-label="Email">
              Email
            </ToggleButton>
            <ToggleButton value={ChannelType.Sms} aria-label="SMS">
              SMS
            </ToggleButton>
            <ToggleButton value={ChannelType.Webhook} aria-label="Webhook">
              Webhook
            </ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={handleCreateBroadcast}
            disabled={
              // TODO: replace with createBroadcastMutation.isPending
              !broadcastName.trim() || createBroadcastMutation.isPending
            }
          >
            {createBroadcastMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <MoveToFolderDialog
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        folders={folders}
        currentFolderId={moveTarget?.folderId ?? null}
        resourceName={moveTarget?.name}
        onConfirm={(folderId) => {
          if (moveTarget) {
            moveToFolderMutation.mutate({
              id: moveTarget.id,
              folderId,
            });
          }
          setMoveTarget(null);
        }}
      />

      {/* Snackbar for feedback (now includes load errors) */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData = unknown> {
    duplicateBroadcast?: (broadcastName: string) => void;
    moveBroadcastToFolder?: (row: Row) => void;
  }
}
