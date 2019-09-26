import { COMMA, ENTER, SPACE } from "@angular/cdk/keycodes"
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout"
import { HttpErrorResponse } from "@angular/common/http"
import { Component, Inject, OnInit } from "@angular/core"
import { FormControl, FormGroup, Validators } from "@angular/forms"
import { MAT_DIALOG_DATA, MatChipInputEvent, MatDialogRef, MatSnackBar } from "@angular/material"
import { CreateForwarderDto, DomainsService, ForwarderDetails, ForwardersService } from "ducky-api-client-angular"
import { MatProgressButtonOptions } from "mat-progress-buttons"
import { Observable, Subscription } from "rxjs"
import { map } from "rxjs/operators"
import { AccountDialogComponent } from "src/app/pages/accounts/components/account-dialog/account-dialog.component"
import { ErrorSnackbarComponent } from "src/app/shared/components/error-snackbar/error-snackbar.component"
import { AddressUsernameValidator } from "src/app/shared/validators/address-username-validator.directive"
import { forwardingTargetValidator } from "src/app/shared/validators/forwarding-target-validator.directive"

@Component({
  selector: "app-forwarder-dialog",
  templateUrl: "./forwarder-dialog.component.html",
  styleUrls: ["./forwarder-dialog.component.scss"]
})
export class ForwarderDialogComponent implements OnInit {
  public constructor(
    public dialogRef: MatDialogRef<AccountDialogComponent>,
    private breakpointObserver: BreakpointObserver,
    private readonly domainsService: DomainsService,
    private readonly forwardersService: ForwardersService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data
  ) {}
  public isModifyDialog: boolean
  public domainsSubscription: Subscription
  public forwarderDetails: ForwarderDetails
  public forwarderDetailsSubscription: Subscription
  public domains: string[]
  public forwardTargets: string[] = []
  public forwardTargetsDirty: boolean = false
  public readonly newTargetSeperators: number[] = [ENTER, COMMA, SPACE]

  public isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(map((result): boolean => result.matches))

  public forwarderForm: FormGroup = new FormGroup({
    name: new FormControl(null),
    addressUser: new FormControl(null, AddressUsernameValidator()),
    domain: new FormControl(null),
    newTarget: new FormControl(null, forwardingTargetValidator()),
    forwardLimit: new FormControl(null, [Validators.min(1), Validators.max(200)])
  })

  public saveButtonConfig: MatProgressButtonOptions = {
    active: false,
    text: "SAVE",
    disabled: true,
    raised: true,
    buttonColor: "primary",
    spinnerColor: "accent",
    spinnerSize: 18,
    mode: "indeterminate"
  }

  public cancelButtonConfig: MatProgressButtonOptions = {
    active: false,
    type: "button",
    text: "CANCEL"
  }

  public ngOnInit(): void {
    this.forwarderForm.valueChanges.subscribe((): void => {
      if (this.forwarderForm.dirty && this.forwarderForm.valid) {
        this.saveButtonConfig.disabled = false
      } else {
        this.saveButtonConfig.disabled = true
      }
    })

    this.getDomains()

    // If id was passed this is a modify dialog and we need to get existing data
    if (this.data) {
      this.isModifyDialog = true
      this.getForwarder()
    }
  }

  public addTarget(event: MatChipInputEvent): void {
    if (this.forwarderForm.controls["newTarget"].valid) {
      if ((event.value || "").trim()) {
        this.forwardTargetsDirty = true
        this.forwardTargets.push(event.value.trim())
      }

      // Reset the input value
      if (event.input) {
        this.forwarderForm.controls["newTarget"].setValue("")
        this.forwarderForm.controls["newTarget"].markAsUntouched()
      }
    } else {
      this.forwarderForm.controls["newTarget"].markAsTouched()
    }
  }

  public removeTarget(target: string): void {
    const index = this.forwardTargets.indexOf(target)

    if (index >= 0) {
      this.forwardTargetsDirty = true
      this.forwarderForm.controls["newTarget"].markAsDirty()
      this.forwarderForm.controls["newTarget"].markAsTouched()
      this.saveButtonConfig.disabled = false
      this.forwardTargets.splice(index, 1)
    }
  }

  public forceCheckForm(): void {
    if (this.forwarderForm.invalid) {
      this.forwarderForm.markAllAsTouched()
    }
  }

  public getDomains(): void {
    const accessToken = localStorage.getItem("access_token")
    this.domainsService.configuration.apiKeys = { Authorization: `bearer ${accessToken}` }
    this.domainsSubscription = this.domainsService.domainsGet().subscribe(
      (domains): void => {
        this.domains = domains.map((value): string => value.domain)
      },
      (error: HttpErrorResponse): void => {
        this.dialogRef.close()
        this.snackBar.openFromComponent(ErrorSnackbarComponent, { data: error, panelClass: ["error-snackbar"] })
      }
    )
  }

  public getForwarder(): void {
    const accessToken = localStorage.getItem("access_token")
    this.forwardersService.configuration.apiKeys = { Authorization: `bearer ${accessToken}` }
    this.forwarderDetailsSubscription = this.forwardersService.forwardersForwarderIdGet(this.data.id).subscribe(
      (forwarder): void => {
        this.forwarderDetails = forwarder
        // Split address to name and domain for split input
        const addressUser = this.forwarderDetails.address.substring(0, this.forwarderDetails.address.lastIndexOf("@"))
        const domain = this.forwarderDetails.address.substring(this.forwarderDetails.address.lastIndexOf("@") + 1)

        this.forwarderForm.setValue({
          name: forwarder.name ? forwarder.name : null, // If name is false then don't fill name field
          addressUser: addressUser,
          domain: domain,
          newTarget: null,
          forwardLimit: forwarder.limits.forward.allowed
        })
        this.forwardTargets = forwarder.targets
      },
      (error: HttpErrorResponse): void => {
        this.dialogRef.close()
        this.snackBar.openFromComponent(ErrorSnackbarComponent, { data: error, panelClass: ["error-snackbar"] })
      }
    )
  }

  public updateForwarder(): void {
    this.dialogRef.disableClose = true
    this.cancelButtonConfig.disabled = true
    this.saveButtonConfig.active = true

    const dirtyValues: any = {}
    for (const key in this.forwarderForm.controls) {
      const value = this.forwarderForm.controls[key].value
      if (this.forwarderForm.controls[key].dirty && value !== null && value !== "") {
        dirtyValues[key] = value
      }
    }

    const address = `${this.forwarderForm.controls["addressUser"].value}@${this.forwarderForm.controls["domain"].value}`
    let dirtyAddress: string
    if (dirtyValues.addressUser || dirtyValues.domain) {
      dirtyAddress = `${this.forwarderForm.controls["addressUser"].value}@${this.forwarderForm.controls["domain"].value}`
    }

    const forwarder: CreateForwarderDto = {
      name: dirtyValues.name,
      address: dirtyAddress,
      targets: this.forwardTargetsDirty ? this.forwardTargets : undefined,
      limits: {
        forward: dirtyValues.forwardLimit
      }
    }

    const onError = (error: HttpErrorResponse): void => {
      this.dialogRef.disableClose = false
      this.cancelButtonConfig.disabled = false
      this.saveButtonConfig.active = false
      this.snackBar.openFromComponent(ErrorSnackbarComponent, { data: error, panelClass: ["error-snackbar"] })
    }

    if (this.isModifyDialog) {
      this.forwardersService.forwardersForwarderIdPut(this.data.id, forwarder).subscribe((): void => {
        this.snackBar.open(`${address} successfully updated`, undefined, {
          panelClass: "success-snackbar"
        })
        this.dialogRef.close(true)
      }, onError)
    } else {
      this.forwardersService.forwardersPost(forwarder).subscribe((): void => {
        this.snackBar.open(`${address} successfully added`, undefined, {
          panelClass: "success-snackbar"
        })
        this.dialogRef.close(true)
      }, onError)
    }
  }
}
