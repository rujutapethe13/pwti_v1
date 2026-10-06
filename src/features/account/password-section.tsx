"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPasswordChangedAt } from "@/lib/password-policy";

import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * The Password section of Settings > Account & security.
 *
 * Owns the dialog's open state so the section itself can stay a plain
 * server-rendered card. Everything it needs arrives as props, so the page can
 * read the change date on the server and render it without a client round trip.
 */

export interface PasswordSectionProps {
  hasPassword: boolean;
  passwordChangedAt: string | null;
}

export function PasswordSection({
  hasPassword,
  passwordChangedAt,
}: PasswordSectionProps) {
  const [open, setOpen] = React.useState(false);

  const lastChanged = formatPasswordChangedAt(passwordChangedAt);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Password</CardTitle>
          <CardDescription className="text-sm">
            {hasPassword
              ? `Last changed: ${lastChanged}`
              : "You sign in with Google, so this account has no password yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => setOpen(true)}
            className="h-11 sm:h-9"
          >
            {hasPassword ? "Change password" : "Set a password"}
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={open}
        onOpenChange={setOpen}
        hasPassword={hasPassword}
      />
    </>
  );
}